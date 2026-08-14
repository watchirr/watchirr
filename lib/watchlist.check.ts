import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { openStore } from "./auth.ts";
import { flatrateCoverage } from "./tmdb.ts";
import {
  addTitle,
  filterItems,
  listItems,
  parseItems,
  parseWatchlistView,
  type Acquire,
  type CoverageLookup,
  type WatchlistItem,
} from "./watchlist.ts";

const dir = mkdtempSync(join(tmpdir(), "watchirr-watchlist-"));
const store = await openStore({ DATA_DIR: dir });

after(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

const fight = {
  tmdbId: 550,
  kind: "movie" as const,
  name: "Fight Club",
  year: 1999,
  posterPath: "/f.jpg",
};

const bad = {
  tmdbId: 1396,
  kind: "tv" as const,
  name: "Breaking Bad",
  year: 2008,
  posterPath: "/bb.jpg",
};

test("flatrateCoverage intersects Paid Services; rent/buy alone is not coverage", () => {
  const json = {
    results: {
      US: {
        flatrate: [
          { provider_id: 8, provider_name: "Netflix" },
          { provider_id: 9, provider_name: "Prime" },
        ],
        rent: [{ provider_id: 2, provider_name: "Apple TV" }],
        buy: [{ provider_id: 2, provider_name: "Apple TV" }],
      },
      BR: {
        flatrate: [{ provider_id: 337, provider_name: "Disney+" }],
      },
    },
  };
  assert.deepEqual(flatrateCoverage(json, "US", [8, 350]), [{ id: 8, name: "Netflix" }]);
  assert.deepEqual(flatrateCoverage(json, "US", [2]), []);
  assert.deepEqual(flatrateCoverage(json, "BR", [8]), []);
  assert.deepEqual(flatrateCoverage(json, "", [8]), []);
  assert.deepEqual(flatrateCoverage(json, "US", []), []);
});

test("parseWatchlistView and filterItems distinguish covered vs needs-Acquire", () => {
  assert.equal(parseWatchlistView("covered"), "covered");
  assert.equal(parseWatchlistView("acquire"), "acquire");
  assert.equal(parseWatchlistView("nope"), "all");

  const items: WatchlistItem[] = [
    { title: fight, services: [{ id: 8, name: "Netflix" }], shouldAcquire: false, addedAt: 2 },
    { title: bad, services: [], shouldAcquire: true, addedAt: 1 },
  ];
  assert.equal(filterItems(items, "all").length, 2);
  assert.deepEqual(
    filterItems(items, "covered").map((i) => i.title.tmdbId),
    [550],
  );
  assert.deepEqual(
    filterItems(items, "acquire").map((i) => i.title.tmdbId),
    [1396],
  );
  assert.equal(parseItems("nope").length, 0);
});

test("flatrate on a Paid Service → Item saved, Acquire not called", async () => {
  const calls: number[] = [];
  const acquire: Acquire = async (title) => {
    calls.push(title.tmdbId);
  };
  const coverage: CoverageLookup = async () => ({
    ok: true,
    services: [{ id: 8, name: "Netflix" }],
  });

  const result = await addTitle(store, fight, { coverage, acquire });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.existed, false);
  assert.equal(result.acquired, false);
  assert.equal(result.item.shouldAcquire, false);
  assert.deepEqual(result.item.services, [{ id: 8, name: "Netflix" }]);
  assert.deepEqual(calls, []);

  const listed = await listItems(store);
  assert.equal(listed.some((i) => i.title.tmdbId === 550 && !i.shouldAcquire), true);
});

test("rent/buy only or no Paid Service hit → should Acquire and acquire port runs", async () => {
  const calls: number[] = [];
  const acquire: Acquire = async (title) => {
    calls.push(title.tmdbId);
  };
  const coverage: CoverageLookup = async () => ({ ok: true, services: [] });

  const result = await addTitle(store, bad, { coverage, acquire });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, true);
  assert.equal(result.item.shouldAcquire, true);
  assert.deepEqual(result.item.services, []);
  assert.deepEqual(calls, [1396]);

  const again = await addTitle(store, bad, { coverage, acquire });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.existed, true);
  assert.equal(again.acquired, false);
  assert.deepEqual(calls, [1396]);
});

test("coverage failure does not create an Item or Acquire", async () => {
  const lonely = {
    tmdbId: 11,
    kind: "movie" as const,
    name: "Star Wars",
    year: 1977,
    posterPath: null,
  };
  const calls: number[] = [];
  const result = await addTitle(store, lonely, {
    coverage: async () => ({ ok: false, error: "unreachable" }),
    acquire: async (title) => {
      calls.push(title.tmdbId);
    },
  });
  assert.deepEqual(result, { ok: false, error: "unreachable" });
  assert.deepEqual(calls, []);
  assert.equal(await listItems(store).then((items) => items.find((i) => i.title.tmdbId === 11)), undefined);
});
