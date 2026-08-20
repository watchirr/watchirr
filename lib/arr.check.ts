import assert from "node:assert/strict";
import { test } from "node:test";
import {
  arrAcquire,
  arrDrop,
  arrLibraryLookup,
  listRadarrLibrary,
  lookupInLibrary,
  movieDefaultsReady,
  parseRadarrMovies,
  seriesDefaultsReady,
  tvdbIdForTmdb,
} from "./arr.ts";
import type { HttpDelete, HttpGet, HttpPost, HttpResult } from "./connect.ts";
import type { HouseholdSettings } from "./settings.ts";

const settings: HouseholdSettings = {
  tmdbApiKey: "tmdb-key",
  omdbApiKey: "",
  country: "US",
  paidServiceIds: [8],
  radarr: {
    url: "http://radarr:7878",
    apiKey: "rk",
    rootFolder: "/movies",
    qualityProfileId: 4,
  },
  sonarr: {
    url: "http://sonarr:8989",
    apiKey: "sk",
    rootFolder: "/tv",
    qualityProfileId: 2,
    languageProfileId: 1,
  },
  jellyfin: { url: "", apiKey: "" },
};

function fakeGet(map: Record<string, HttpResult>): HttpGet {
  return async (url) => {
    for (const [key, value] of Object.entries(map)) {
      if (url.includes(key)) return value;
    }
    return { error: "unreachable" };
  };
}

test("movieDefaultsReady and seriesDefaultsReady require url/key/quality/root", () => {
  assert.deepEqual(movieDefaultsReady(settings.radarr), { qualityProfileId: 4, rootFolder: "/movies" });
  assert.deepEqual(movieDefaultsReady(settings.radarr, { qualityProfileId: 9, rootFolder: "/uhd" }), {
    qualityProfileId: 9,
    rootFolder: "/uhd",
  });
  assert.equal(movieDefaultsReady({ ...settings.radarr, qualityProfileId: null }), null);
  assert.deepEqual(seriesDefaultsReady(settings.sonarr), {
    qualityProfileId: 2,
    rootFolder: "/tv",
    languageProfileId: 1,
  });
});

test("lookupInLibrary treats numeric id as already In Library", () => {
  assert.deepEqual(lookupInLibrary([{ title: "X", id: 12, tmdbId: 550 }]).inLibrary, true);
  assert.deepEqual(lookupInLibrary([{ title: "X", tmdbId: 550 }]).inLibrary, false);
  assert.deepEqual(lookupInLibrary([]).hit, null);
});

test("uncovered movie Acquire hits Radarr with override quality/root", async () => {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const get = fakeGet({
    "/api/v3/movie/lookup": { status: 200, json: [{ title: "Fight Club", tmdbId: 550, year: 1999 }] },
  });
  const post: HttpPost = async (url, _h, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { status: 201, json: { id: 1 } };
  };
  const acquire = arrAcquire(settings, get, post);
  const result = await acquire(
    { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: null },
    { qualityProfileId: 9, rootFolder: "/uhd" },
  );
  assert.equal(result.ok, true);
  assert.equal(posts.length, 1);
  assert.equal(posts[0]?.url, "http://radarr:7878/api/v3/movie");
  assert.equal(posts[0]?.body.qualityProfileId, 9);
  assert.equal(posts[0]?.body.rootFolderPath, "/uhd");
  assert.equal(posts[0]?.body.minimumAvailability, "released");
  assert.equal(posts[0]?.body.monitored, true);
});

test("already In Library movie → library true and Acquire does not POST", async () => {
  const get = fakeGet({
    "/api/v3/movie/lookup": { status: 200, json: [{ title: "Fight Club", id: 42, tmdbId: 550 }] },
  });
  const posts: string[] = [];
  const post: HttpPost = async (url) => {
    posts.push(url);
    return { status: 201, json: {} };
  };
  const lib = await arrLibraryLookup(settings, get)({
    tmdbId: 550,
    kind: "movie",
    name: "Fight Club",
    year: 1999,
    posterPath: null,
  });
  assert.deepEqual(lib, { ok: true, inLibrary: true });
  const acq = await arrAcquire(settings, get, post)({
    tmdbId: 550,
    kind: "movie",
    name: "Fight Club",
    year: 1999,
    posterPath: null,
  });
  assert.equal(acq.ok, true);
  assert.deepEqual(posts, []);
});

test("TV Acquire monitors only selected seasons", async () => {
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const get = fakeGet({
    "/tv/1396/external_ids": { status: 200, json: { tvdb_id: 81189 } },
    "/api/v3/series/lookup": {
      status: 200,
      json: [
        {
          title: "Breaking Bad",
          tvdbId: 81189,
          seasons: [
            { seasonNumber: 0, monitored: true },
            { seasonNumber: 1, monitored: true },
            { seasonNumber: 2, monitored: true },
            { seasonNumber: 3, monitored: true },
          ],
        },
      ],
    },
  });
  const post: HttpPost = async (url, _h, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { status: 201, json: { id: 1 } };
  };
  const tvdb = await tvdbIdForTmdb("tmdb-key", 1396, get);
  assert.deepEqual(tvdb, { ok: true, tvdbId: 81189 });
  const result = await arrAcquire(settings, get, post)(
    { tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: null },
    { seasons: [1, 3] },
  );
  assert.equal(result.ok, true);
  assert.equal(posts[0]?.url, "http://sonarr:8989/api/v3/series");
  assert.equal(posts[0]?.body.qualityProfileId, 2);
  assert.equal(posts[0]?.body.rootFolderPath, "/tv");
  assert.equal(posts[0]?.body.languageProfileId, 1);
  const seasons = posts[0]?.body.seasons as { seasonNumber: number; monitored: boolean }[];
  assert.deepEqual(
    seasons.map((s) => ({ n: s.seasonNumber, m: s.monitored })),
    [
      { n: 0, m: false },
      { n: 1, m: true },
      { n: 2, m: false },
      { n: 3, m: true },
    ],
  );
});

test("TV Acquire without seasons fails clearly", async () => {
  const result = await arrAcquire(settings, async () => ({ error: "unreachable" }), async () => ({
    error: "unreachable",
  }))({ tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: null }, {});
  assert.deepEqual(result, { ok: false, error: "missing-seasons" });
});

test("In Library TV expands seasons via PUT + SeriesSearch", async () => {
  const puts: { url: string; body: Record<string, unknown> }[] = [];
  const posts: { url: string; body: Record<string, unknown> }[] = [];
  const get = fakeGet({
    "/tv/1396/external_ids": { status: 200, json: { tvdb_id: 81189 } },
    "/api/v3/series/lookup": {
      status: 200,
      json: [{ title: "Breaking Bad", id: 42, tvdbId: 81189 }],
    },
    "/api/v3/series/42": {
      status: 200,
      json: {
        id: 42,
        title: "Breaking Bad",
        seasons: [
          { seasonNumber: 1, monitored: true },
          { seasonNumber: 2, monitored: false },
          { seasonNumber: 3, monitored: false },
        ],
      },
    },
  });
  const post: HttpPost = async (url, _h, body) => {
    posts.push({ url, body: body as Record<string, unknown> });
    return { status: 201, json: {} };
  };
  const put: HttpPost = async (url, _h, body) => {
    puts.push({ url, body: body as Record<string, unknown> });
    return { status: 202, json: body };
  };
  const result = await arrAcquire(settings, get, post, put)(
    { tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: null },
    { seasons: [2, 3] },
  );
  assert.equal(result.ok, true);
  assert.equal(puts[0]?.url, "http://sonarr:8989/api/v3/series/42");
  const seasons = puts[0]?.body.seasons as { seasonNumber: number; monitored: boolean }[];
  assert.deepEqual(
    seasons.map((s) => ({ n: s.seasonNumber, m: s.monitored })),
    [
      { n: 1, m: true },
      { n: 2, m: true },
      { n: 3, m: true },
    ],
  );
  assert.equal(posts[0]?.url, "http://sonarr:8989/api/v3/command");
  assert.deepEqual(posts[0]?.body, { name: "SeriesSearch", seriesId: 42 });
});

test("Acquire fails clearly when *arr defaults missing", async () => {
  const bare = {
    ...settings,
    radarr: { ...settings.radarr, qualityProfileId: null, rootFolder: "" },
  };
  const result = await arrAcquire(bare, async () => ({ error: "unreachable" }), async () => ({
    error: "unreachable",
  }))({ tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: null });
  assert.deepEqual(result, { ok: false, error: "missing-defaults" });
});

test("arrDrop movie DELETEs with deleteFiles and no import exclusion", async () => {
  const deleted: string[] = [];
  const get = fakeGet({
    "/api/v3/movie/lookup": { status: 200, json: [{ title: "Fight Club", id: 42, tmdbId: 550 }] },
  });
  const del: HttpDelete = async (url) => {
    deleted.push(url);
    return { status: 200, json: {} };
  };
  const result = await arrDrop(settings, get, del)({
    tmdbId: 550,
    kind: "movie",
    name: "Fight Club",
    year: 1999,
    posterPath: null,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(deleted, [
    "http://radarr:7878/api/v3/movie/42?deleteFiles=true&addImportExclusion=false",
  ]);
});

test("arrDrop series DELETEs with deleteFiles; not In Library skips DELETE", async () => {
  const deleted: string[] = [];
  const del: HttpDelete = async (url) => {
    deleted.push(url);
    return { status: 200, json: {} };
  };
  const inLib = fakeGet({
    "/tv/1396/external_ids": { status: 200, json: { tvdb_id: 81189 } },
    "/api/v3/series/lookup": { status: 200, json: [{ title: "Breaking Bad", id: 7, tvdbId: 81189 }] },
  });
  const dropped = await arrDrop(settings, inLib, del)({
    tmdbId: 1396,
    kind: "tv",
    name: "Breaking Bad",
    year: 2008,
    posterPath: null,
  });
  assert.equal(dropped.ok, true);
  assert.deepEqual(deleted, [
    "http://sonarr:8989/api/v3/series/7?deleteFiles=true&addImportListExclusion=false",
  ]);

  deleted.length = 0;
  const missing = fakeGet({
    "/api/v3/movie/lookup": { status: 200, json: [{ title: "Fight Club", tmdbId: 550 }] },
  });
  const skip = await arrDrop(settings, missing, del)({
    tmdbId: 550,
    kind: "movie",
    name: "Fight Club",
    year: 1999,
    posterPath: null,
  });
  assert.equal(skip.ok, true);
  assert.deepEqual(deleted, []);
});

test("parseRadarrMovies maps Titles and skips missing TMDB id", () => {
  const { titles, skippedNoTmdb } = parseRadarrMovies([
    { title: "Fight Club", tmdbId: 550, year: 1999 },
    { title: "No TMDB", year: 2000 },
    { title: "Pulp Fiction", tmdbId: 680, year: 1994, originalTitle: "Pulp Fiction" },
    { tmdbId: 0, title: "Zero id" },
  ]);
  assert.equal(skippedNoTmdb, 2);
  assert.deepEqual(titles, [
    { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: null },
    { tmdbId: 680, kind: "movie", name: "Pulp Fiction", year: 1994, posterPath: null },
  ]);
});

test("listRadarrLibrary GETs /api/v3/movie and surfaces unreachable", async () => {
  const get = fakeGet({
    "/api/v3/movie": {
      status: 200,
      json: [
        { title: "Fight Club", tmdbId: 550, year: 1999 },
        { title: "Orphan", year: 2010 },
      ],
    },
  });
  const listed = await listRadarrLibrary(settings, get);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.skippedNoTmdb, 1);
  assert.deepEqual(listed.titles, [
    { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: null },
  ]);

  const down = await listRadarrLibrary(settings, async () => ({ error: "unreachable" }));
  assert.deepEqual(down, { ok: false, error: "arr-unreachable" });

  const denied = await listRadarrLibrary(settings, async () => ({ status: 401, json: null }));
  assert.deepEqual(denied, { ok: false, error: "arr-unauthorized" });

  const bare = await listRadarrLibrary({
    radarr: { ...settings.radarr, url: "", apiKey: "" },
  });
  assert.deepEqual(bare, { ok: false, error: "missing-defaults" });
});
