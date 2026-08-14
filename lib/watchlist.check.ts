import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import type { AcquireFn, LibraryLookup } from "./arr.ts";
import { openStore } from "./auth.ts";
import { flatrateCoverage } from "./tmdb.ts";
import {
  addTitle,
  expandSeasons,
  filterItems,
  findItem,
  listItems,
  markWatched,
  parseItems,
  parseWatchlistView,
  syncJellyfinWatched,
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

test("parseWatchlistView and filterItems distinguish covered vs needs-Acquire vs Watched", () => {
  assert.equal(parseWatchlistView("covered"), "covered");
  assert.equal(parseWatchlistView("acquire"), "acquire");
  assert.equal(parseWatchlistView("watched"), "watched");
  assert.equal(parseWatchlistView("nope"), "all");

  const items: WatchlistItem[] = [
    {
      title: fight,
      services: [{ id: 8, name: "Netflix" }],
      shouldAcquire: false,
      inLibrary: false,
      watched: false,
      addedAt: 2,
    },
    {
      title: bad,
      services: [],
      shouldAcquire: true,
      inLibrary: false,
      watched: false,
      addedAt: 1,
    },
    {
      title: { tmdbId: 11, kind: "movie", name: "Star Wars", year: 1977, posterPath: null },
      services: [],
      shouldAcquire: false,
      inLibrary: true,
      watched: false,
      addedAt: 0,
    },
    {
      title: { tmdbId: 680, kind: "movie", name: "Pulp Fiction", year: 1994, posterPath: null },
      services: [{ id: 8, name: "Netflix" }],
      shouldAcquire: false,
      inLibrary: false,
      watched: true,
      addedAt: 3,
    },
  ];
  assert.equal(filterItems(items, "all").length, 4);
  assert.deepEqual(
    filterItems(items, "covered").map((i) => i.title.tmdbId),
    [550],
  );
  assert.deepEqual(
    filterItems(items, "acquire").map((i) => i.title.tmdbId),
    [1396],
  );
  assert.deepEqual(
    filterItems(items, "watched").map((i) => i.title.tmdbId),
    [680],
  );
  assert.equal(parseItems("nope").length, 0);
});

test("flatrate on a Paid Service → Item saved, Acquire not called", async () => {
  const calls: number[] = [];
  const acquire: AcquireFn = async (title) => {
    calls.push(title.tmdbId);
    return { ok: true };
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
  assert.equal(result.item.inLibrary, false);
  assert.equal(result.item.watched, false);
  assert.deepEqual(result.item.services, [{ id: 8, name: "Netflix" }]);
  assert.deepEqual(calls, []);

  const listed = await listItems(store);
  assert.equal(listed.some((i) => i.title.tmdbId === 550 && !i.shouldAcquire), true);
});

test("rent/buy only or no Paid Service hit → should Acquire and acquire port runs once", async () => {
  const calls: { tmdbId: number; quality?: number | null; seasons?: number[] }[] = [];
  const acquire: AcquireFn = async (title, opts) => {
    calls.push({ tmdbId: title.tmdbId, quality: opts?.qualityProfileId, seasons: opts?.seasons });
    return { ok: true };
  };
  const coverage: CoverageLookup = async () => ({ ok: true, services: [] });
  const inLibrary: LibraryLookup = async () => ({ ok: true, inLibrary: false });

  const result = await addTitle(
    store,
    bad,
    { coverage, acquire, inLibrary },
    { qualityProfileId: 7, seasons: [1, 2] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, true);
  assert.equal(result.item.shouldAcquire, true);
  assert.equal(result.item.inLibrary, false);
  assert.deepEqual(result.item.services, []);
  assert.deepEqual(calls, [{ tmdbId: 1396, quality: 7, seasons: [1, 2] }]);

  const again = await addTitle(store, bad, { coverage, acquire, inLibrary });
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.existed, true);
  assert.equal(again.acquired, false);
  assert.deepEqual(calls, [{ tmdbId: 1396, quality: 7, seasons: [1, 2] }]);
});

test("empty seasons on TV Acquire does not create an Item", async () => {
  const lonely = {
    tmdbId: 1399,
    kind: "tv" as const,
    name: "Game of Thrones",
    year: 2011,
    posterPath: null,
  };
  const result = await addTitle(store, lonely, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: false }),
    acquire: async (_title, opts) =>
      opts?.seasons && opts.seasons.length > 0 ? { ok: true } : { ok: false, error: "missing-seasons" },
  });
  assert.deepEqual(result, { ok: false, error: "missing-seasons" });
  assert.equal(await listItems(store).then((items) => items.find((i) => i.title.tmdbId === 1399)), undefined);
});

test("In Library → Watchlist Item created, Acquire not called", async () => {
  const lonely = {
    tmdbId: 603,
    kind: "movie" as const,
    name: "The Matrix",
    year: 1999,
    posterPath: null,
  };
  const calls: number[] = [];
  const result = await addTitle(
    store,
    lonely,
    {
      coverage: async () => ({ ok: true, services: [] }),
      inLibrary: async () => ({ ok: true, inLibrary: true }),
      acquire: async (title) => {
        calls.push(title.tmdbId);
        return { ok: true };
      },
    },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, false);
  assert.equal(result.item.inLibrary, true);
  assert.equal(result.item.shouldAcquire, false);
  assert.deepEqual(calls, []);
});

test("In Library TV with seasons expands via acquire (no double-queue add)", async () => {
  const lonely = {
    tmdbId: 1400,
    kind: "tv" as const,
    name: "The Wire",
    year: 2002,
    posterPath: null,
  };
  const calls: { seasons?: number[] }[] = [];
  const result = await addTitle(
    store,
    lonely,
    {
      coverage: async () => ({ ok: true, services: [] }),
      inLibrary: async () => ({ ok: true, inLibrary: true }),
      acquire: async (_title, opts) => {
        calls.push({ seasons: opts?.seasons });
        return { ok: true };
      },
    },
    { seasons: [2] },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, true);
  assert.equal(result.item.inLibrary, true);
  assert.equal(result.item.shouldAcquire, false);
  assert.deepEqual(calls, [{ seasons: [2] }]);
});

test("expandSeasons on existing In Library Item calls acquire with seasons", async () => {
  const onList = {
    tmdbId: 1401,
    kind: "tv" as const,
    name: "Mad Men",
    year: 2007,
    posterPath: null,
  };
  await addTitle(store, onList, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
  });
  const calls: number[][] = [];
  const result = await expandSeasons(store, 1401, [3, 4], {
    acquire: async (_t, opts) => {
      calls.push(opts?.seasons ?? []);
      return { ok: true };
    },
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, true);
  assert.equal(result.existed, true);
  assert.deepEqual(calls, [[3, 4]]);
});

test("Acquire failure or missing defaults does not create an Item", async () => {
  const lonely = {
    tmdbId: 13,
    kind: "movie" as const,
    name: "Forrest Gump",
    year: 1994,
    posterPath: null,
  };
  const result = await addTitle(store, lonely, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: false }),
    acquire: async () => ({ ok: false, error: "missing-defaults" }),
  });
  assert.deepEqual(result, { ok: false, error: "missing-defaults" });
  assert.equal(await listItems(store).then((items) => items.find((i) => i.title.tmdbId === 13)), undefined);
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
      return { ok: true };
    },
  });
  assert.deepEqual(result, { ok: false, error: "unreachable" });
  assert.deepEqual(calls, []);
  assert.equal(await listItems(store).then((items) => items.find((i) => i.title.tmdbId === 11)), undefined);
});

test("manual mark Watched flips Item and does not call Acquire", async () => {
  const lonely = {
    tmdbId: 278,
    kind: "movie" as const,
    name: "The Shawshank Redemption",
    year: 1994,
    posterPath: null,
  };
  const calls: number[] = [];
  await addTitle(store, lonely, {
    coverage: async () => ({ ok: true, services: [{ id: 8, name: "Netflix" }] }),
    acquire: async (title) => {
      calls.push(title.tmdbId);
      return { ok: true };
    },
  });
  const marked = await markWatched(store, 278, "movie");
  assert.equal(marked?.watched, true);
  assert.deepEqual(calls, []);
  const again = await markWatched(store, 278, "movie");
  assert.equal(again?.watched, true);
  assert.equal((await findItem(store, 278, "movie"))?.watched, true);
  assert.equal(await markWatched(store, 999, "movie"), null);
});

test("Jellyfin progress > 0% matching a Watchlist Title sets Watched without Acquire", async () => {
  const lonely = {
    tmdbId: 424,
    kind: "movie" as const,
    name: "Schindler's List",
    year: 1993,
    posterPath: null,
  };
  const calls: number[] = [];
  await addTitle(store, lonely, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
    acquire: async (title) => {
      calls.push(title.tmdbId);
      return { ok: true };
    },
  });
  const sync = await syncJellyfinWatched(store, {
    progress: async () => ({
      ok: true,
      progressed: [
        { tmdbId: 424, kind: "movie" },
        { tmdbId: 1, kind: "movie" },
      ],
    }),
  });
  assert.deepEqual(sync, { marked: 1 });
  assert.equal((await findItem(store, 424, "movie"))?.watched, true);
  assert.deepEqual(calls, []);

  const noop = await syncJellyfinWatched(store, {
    progress: async () => ({ ok: true, progressed: [{ tmdbId: 424, kind: "movie" }] }),
  });
  assert.deepEqual(noop, { marked: 0 });

  const fail = await syncJellyfinWatched(store, {
    progress: async () => ({ ok: false, error: "jellyfin-unreachable" }),
  });
  assert.deepEqual(fail, { marked: 0 });
});
