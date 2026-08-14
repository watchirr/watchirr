import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpGet, HttpResult } from "./connect.ts";
import {
  hasProgress,
  jellyfinProgress,
  titleFromJellyItem,
} from "./jellyfin.ts";

function fakeGet(map: Record<string, HttpResult>): HttpGet {
  return async (url) => {
    for (const [key, value] of Object.entries(map)) {
      if (url.includes(key)) return value;
    }
    return { error: "unreachable" };
  };
}

test("hasProgress is true for ticks, percentage, or Played", () => {
  assert.equal(hasProgress(null), false);
  assert.equal(hasProgress({}), false);
  assert.equal(hasProgress({ PlaybackPositionTicks: 0, PlayedPercentage: 0 }), false);
  assert.equal(hasProgress({ PlaybackPositionTicks: 1 }), true);
  assert.equal(hasProgress({ PlayedPercentage: 0.5 }), true);
  assert.equal(hasProgress({ Played: true }), true);
});

test("titleFromJellyItem maps Movie/Series with TMDB + progress", () => {
  assert.equal(
    titleFromJellyItem({
      Type: "Movie",
      ProviderIds: { Tmdb: "550" },
      UserData: { PlaybackPositionTicks: 100 },
    })?.tmdbId,
    550,
  );
  assert.deepEqual(
    titleFromJellyItem({
      Type: "Series",
      ProviderIds: { Tmdb: "1396" },
      UserData: { PlayedPercentage: 12 },
    }),
    { tmdbId: 1396, kind: "tv" },
  );
  assert.equal(
    titleFromJellyItem({
      Type: "Movie",
      ProviderIds: { Tmdb: "550" },
      UserData: { PlaybackPositionTicks: 0 },
    }),
    null,
  );
  assert.equal(
    titleFromJellyItem({
      Type: "Episode",
      ProviderIds: { Tmdb: "1" },
      UserData: { Played: true },
    }),
    null,
  );
});

test("jellyfinProgress skips empty settings; polls users then Movie/Series", async () => {
  const empty = await jellyfinProgress({ jellyfin: { url: "", apiKey: "" } })();
  assert.deepEqual(empty, { ok: true, progressed: [] });

  const get = fakeGet({
    "/Users/u1/Items": {
      status: 200,
      json: {
        Items: [
          {
            Type: "Movie",
            ProviderIds: { Tmdb: "550" },
            UserData: { PlaybackPositionTicks: 50 },
          },
          {
            Type: "Movie",
            ProviderIds: { Tmdb: "603" },
            UserData: { PlaybackPositionTicks: 0 },
          },
        ],
      },
    },
    "/Users/u2/Items": {
      status: 200,
      json: {
        Items: [
          {
            Type: "Series",
            ProviderIds: { Tmdb: "1396" },
            UserData: { PlayedPercentage: 3 },
          },
          {
            Type: "Movie",
            ProviderIds: { Tmdb: "550" },
            UserData: { Played: true },
          },
        ],
      },
    },
    "/Users": {
      status: 200,
      json: [{ Id: "u1" }, { Id: "u2" }],
    },
  });

  const result = await jellyfinProgress(
    { jellyfin: { url: "http://jellyfin:8096", apiKey: "jk" } },
    get,
  )();
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.progressed, [
    { tmdbId: 550, kind: "movie" },
    { tmdbId: 1396, kind: "tv" },
  ]);
});

test("jellyfinProgress surfaces unauthorized", async () => {
  const result = await jellyfinProgress(
    { jellyfin: { url: "http://jellyfin:8096", apiKey: "jk" } },
    async () => ({ status: 401, json: null }),
  )();
  assert.deepEqual(result, { ok: false, error: "jellyfin-unauthorized" });
});
