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
  byKind,
  expandSeasons,
  filterCounts,
  filterItems,
  findItem,
  importLibraryTitles,
  keeperAcquire,
  listItems,
  markWatched,
  parseItems,
  parseWatchlistSection,
  parseWatchlistView,
  removeTitle,
  sectionItems,
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

test("parseWatchlistView and filterItems distinguish Covered vs In Library", () => {
  assert.equal(parseWatchlistView("covered"), "covered");
  assert.equal(parseWatchlistView("covered", 0), "all");
  assert.equal(parseWatchlistView("library"), "library");
  assert.equal(parseWatchlistView("acquire"), "all");
  assert.equal(parseWatchlistView("watched"), "all");
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
    [550, 680],
  );
  assert.deepEqual(
    filterItems(items, "library").map((i) => i.title.tmdbId),
    [1396, 11],
  );
  const counts = filterCounts(items);
  assert.equal(counts.all, 4);
  assert.equal(counts.covered, 2);
  assert.equal(counts.library, 2);
  assert.equal(counts.covered + counts.library, counts.all);
  assert.equal(parseItems("nope").length, 0);
});

test("watch status sections: All / Not watched / Watched", () => {
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
  assert.equal(parseWatchlistSection("unwatched"), "unwatched");
  assert.equal(parseWatchlistSection("still"), "unwatched");
  assert.equal(parseWatchlistSection("watched"), "watched");
  assert.equal(parseWatchlistSection("coming"), "all");
  assert.equal(parseWatchlistSection("nope"), "all");
  assert.equal(sectionItems(items, "all").length, 4);
  assert.deepEqual(
    sectionItems(items, "unwatched").map((i) => i.title.tmdbId),
    [550, 1396, 11],
  );
  assert.deepEqual(
    sectionItems(items, "watched").map((i) => i.title.tmdbId),
    [680],
  );
});

test("byKind scopes listings to the app-wide Movie / TV pick", () => {
  const items: WatchlistItem[] = [
    {
      title: fight,
      services: [],
      shouldAcquire: true,
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
  ];
  assert.equal(byKind(items, "all").length, 2);
  assert.deepEqual(
    byKind(items, "movie").map((i) => i.title.tmdbId),
    [550],
  );
  assert.deepEqual(
    byKind(items, "tv").map((i) => i.title.tmdbId),
    [1396],
  );
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
  assert.deepEqual(sync, { ok: true, marked: 1, alreadyWatched: 0, noMatch: 1 });
  assert.equal((await findItem(store, 424, "movie"))?.watched, true);
  assert.deepEqual(calls, []);

  const noop = await syncJellyfinWatched(store, {
    progress: async () => ({ ok: true, progressed: [{ tmdbId: 424, kind: "movie" }] }),
  });
  assert.deepEqual(noop, { ok: true, marked: 0, alreadyWatched: 1, noMatch: 0 });

  const fail = await syncJellyfinWatched(store, {
    progress: async () => ({ ok: false, error: "jellyfin-unreachable" }),
  });
  assert.deepEqual(fail, { ok: false, error: "jellyfin-unreachable" });
});

test("syncJellyfinWatched counts marked / already Watched / no Watchlist match", async () => {
  const a = {
    tmdbId: 10,
    kind: "movie" as const,
    name: "Fresh",
    year: 2020,
    posterPath: null,
  };
  const b = {
    tmdbId: 20,
    kind: "movie" as const,
    name: "Already",
    year: 2021,
    posterPath: null,
  };
  await addTitle(store, a, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
  });
  await addTitle(store, b, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
  });
  await markWatched(store, 20, "movie");

  const beforeCount = (await listItems(store)).length;
  const result = await syncJellyfinWatched(store, {
    progress: async () => ({
      ok: true,
      progressed: [
        { tmdbId: 10, kind: "movie" },
        { tmdbId: 20, kind: "movie" },
        { tmdbId: 99, kind: "tv" },
      ],
    }),
  });
  assert.deepEqual(result, { ok: true, marked: 1, alreadyWatched: 1, noMatch: 1 });
  assert.equal((await findItem(store, 10, "movie"))?.watched, true);
  assert.equal((await findItem(store, 99, "tv")), null);
  assert.equal((await listItems(store)).length, beforeCount);

  const empty = await syncJellyfinWatched(store, {
    progress: async () => ({ ok: true, progressed: [] }),
  });
  assert.deepEqual(empty, { ok: true, marked: 0, alreadyWatched: 0, noMatch: 0 });
});

test("Remove local → *arr drop + Item gone; streaming-only skips *arr", async () => {
  const local = {
    tmdbId: 155,
    kind: "movie" as const,
    name: "The Dark Knight",
    year: 2008,
    posterPath: null,
  };
  const stream = {
    tmdbId: 27205,
    kind: "movie" as const,
    name: "Inception",
    year: 2010,
    posterPath: null,
  };
  const inLib = {
    tmdbId: 11216,
    kind: "movie" as const,
    name: "Cinema Paradiso",
    year: 1988,
    posterPath: null,
  };
  await addTitle(store, local, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: false }),
    acquire: async () => ({ ok: true }),
  });
  await addTitle(store, stream, {
    coverage: async () => ({ ok: true, services: [{ id: 8, name: "Netflix" }] }),
  });
  await addTitle(store, inLib, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
    acquire: async () => ({ ok: true }),
  });

  const dropped: number[] = [];
  const drop = async (title: { tmdbId: number }) => {
    dropped.push(title.tmdbId);
    return { ok: true } as const;
  };

  const localRm = await removeTitle(store, 155, "movie", { drop });
  assert.equal(localRm.ok, true);
  assert.equal(await findItem(store, 155, "movie"), null);

  const streamRm = await removeTitle(store, 27205, "movie", { drop });
  assert.equal(streamRm.ok, true);
  assert.equal(await findItem(store, 27205, "movie"), null);

  const libRm = await removeTitle(store, 11216, "movie", { drop });
  assert.equal(libRm.ok, true);
  assert.equal(await findItem(store, 11216, "movie"), null);

  assert.deepEqual(dropped, [155, 11216]);
});

test("Watched does not Remove; drop failure keeps the Item", async () => {
  const lonely = {
    tmdbId: 807,
    kind: "movie" as const,
    name: "Se7en",
    year: 1995,
    posterPath: null,
  };
  await addTitle(store, lonely, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
  });
  const marked = await markWatched(store, 807, "movie");
  assert.equal(marked?.watched, true);
  assert.equal((await findItem(store, 807, "movie"))?.title.tmdbId, 807);

  const dropped: number[] = [];
  const fail = await removeTitle(store, 807, "movie", {
    drop: async (title) => {
      dropped.push(title.tmdbId);
      return { ok: false, error: "arr-unreachable" };
    },
  });
  assert.deepEqual(fail, { ok: false, error: "arr-unreachable" });
  assert.deepEqual(dropped, [807]);
  assert.equal((await findItem(store, 807, "movie"))?.watched, true);
});

test("re-add after Remove runs coverage and can Acquire again", async () => {
  const lonely = {
    tmdbId: 120,
    kind: "movie" as const,
    name: "The Lord of the Rings",
    year: 2001,
    posterPath: null,
  };
  const acquires: number[] = [];
  const deps = {
    coverage: async () => ({ ok: true as const, services: [] }),
    inLibrary: async () => ({ ok: true as const, inLibrary: false }),
    acquire: async (title: { tmdbId: number }) => {
      acquires.push(title.tmdbId);
      return { ok: true as const };
    },
  };
  const first = await addTitle(store, lonely, deps);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.acquired, true);
  assert.deepEqual(acquires, [120]);

  const rm = await removeTitle(store, 120, "movie", { drop: async () => ({ ok: true }) });
  assert.equal(rm.ok, true);
  assert.equal(await findItem(store, 120, "movie"), null);

  const again = await addTitle(store, lonely, deps);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.existed, false);
  assert.equal(again.acquired, true);
  assert.deepEqual(acquires, [120, 120]);
});

test("keeperAcquire: covered + not In Library → Acquire called once, item updated", async () => {
  const covered = {
    tmdbId: 10001,
    kind: "movie" as const,
    name: "Keeper Movie",
    year: 2020,
    posterPath: null,
  };
  await addTitle(store, covered, {
    coverage: async () => ({ ok: true, services: [{ id: 8, name: "Netflix" }] }),
  });
  const calls: { tmdbId: number; quality?: number | null; seasons?: number[] }[] = [];
  const result = await keeperAcquire(
    store,
    10001,
    "movie",
    {
      acquire: async (title, opts) => {
        calls.push({ tmdbId: title.tmdbId, quality: opts?.qualityProfileId, seasons: opts?.seasons });
        return { ok: true };
      },
    },
    { qualityProfileId: 4 },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.acquired, true);
  assert.equal(result.existed, true);
  assert.equal(result.item.inLibrary, true);
  assert.equal(result.item.shouldAcquire, false);
  assert.deepEqual(calls, [{ tmdbId: 10001, quality: 4, seasons: undefined }]);
  assert.equal((await findItem(store, 10001, "movie"))?.inLibrary, true);
});

test("keeperAcquire: already In Library → error, Acquire not called", async () => {
  const inLib = {
    tmdbId: 10002,
    kind: "movie" as const,
    name: "Already In Library",
    year: 2019,
    posterPath: null,
  };
  await addTitle(store, inLib, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: true }),
  });
  const calls: number[] = [];
  const result = await keeperAcquire(store, 10002, "movie", {
    acquire: async (title) => { calls.push(title.tmdbId); return { ok: true }; },
  });
  assert.deepEqual(result, { ok: false, error: "already-in-library" });
  assert.deepEqual(calls, []);
});

test("keeperAcquire: uncovered item (shouldAcquire: true) → error, Acquire not called", async () => {
  const uncovered = {
    tmdbId: 10003,
    kind: "movie" as const,
    name: "Uncovered Movie",
    year: 2018,
    posterPath: null,
  };
  await addTitle(store, uncovered, {
    coverage: async () => ({ ok: true, services: [] }),
    inLibrary: async () => ({ ok: true, inLibrary: false }),
    acquire: async () => ({ ok: true }),
  });
  const calls: number[] = [];
  const result = await keeperAcquire(store, 10003, "movie", {
    acquire: async (title) => { calls.push(title.tmdbId); return { ok: true }; },
  });
  assert.deepEqual(result, { ok: false, error: "uncovered" });
  assert.deepEqual(calls, []);
});

test("keeperAcquire: Acquire adapter error bubbles, item state unchanged", async () => {
  const toFail = {
    tmdbId: 10004,
    kind: "movie" as const,
    name: "Will Fail",
    year: 2017,
    posterPath: null,
  };
  await addTitle(store, toFail, {
    coverage: async () => ({ ok: true, services: [{ id: 8, name: "Netflix" }] }),
  });
  const result = await keeperAcquire(store, 10004, "movie", {
    acquire: async () => ({ ok: false, error: "arr-unreachable" }),
  });
  assert.deepEqual(result, { ok: false, error: "arr-unreachable" });
  const item = await findItem(store, 10004, "movie");
  assert.equal(item?.inLibrary, false);
  assert.equal(item?.shouldAcquire, false);
});

test("keeperAcquire: TV seasons passed through to Acquire adapter", async () => {
  const tvShow = {
    tmdbId: 10005,
    kind: "tv" as const,
    name: "Keeper Show",
    year: 2016,
    posterPath: null,
  };
  await addTitle(store, tvShow, {
    coverage: async () => ({ ok: true, services: [{ id: 9, name: "Prime" }] }),
  });
  const calls: { seasons?: number[] }[] = [];
  const result = await keeperAcquire(
    store,
    10005,
    "tv",
    {
      acquire: async (_t, opts) => {
        calls.push({ seasons: opts?.seasons });
        return { ok: true };
      },
    },
    { seasons: [2, 3] },
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [{ seasons: [2, 3] }]);
});

test("keeperAcquire: not on Watchlist → not-found error", async () => {
  const result = await keeperAcquire(store, 99999, "movie", {});
  assert.deepEqual(result, { ok: false, error: "not-found" });
});

test("Remove keep files skips *arr drop; re-add does not Acquire while In Library", async () => {
  const lonely = {
    tmdbId: 629,
    kind: "movie" as const,
    name: "The Usual Suspects",
    year: 1995,
    posterPath: null,
  };
  const dropped: number[] = [];
  const acquires: number[] = [];
  const deps = {
    coverage: async () => ({ ok: true as const, services: [] }),
    inLibrary: async () => ({ ok: true as const, inLibrary: true }),
    acquire: async (title: { tmdbId: number }) => {
      acquires.push(title.tmdbId);
      return { ok: true as const };
    },
  };
  await addTitle(store, lonely, deps);
  const rm = await removeTitle(store, 629, "movie", {
    keepFiles: true,
    drop: async (title) => {
      dropped.push(title.tmdbId);
      return { ok: true };
    },
  });
  assert.equal(rm.ok, true);
  assert.equal(await findItem(store, 629, "movie"), null);
  assert.deepEqual(dropped, []);

  const again = await addTitle(store, lonely, deps);
  assert.equal(again.ok, true);
  if (!again.ok) return;
  assert.equal(again.acquired, false);
  assert.deepEqual(acquires, []);
});

test("importLibraryTitles adds In Library Items without coverage or Acquire", async () => {
  const a = {
    tmdbId: 20001,
    kind: "movie" as const,
    name: "Import A",
    year: 2001,
    posterPath: null,
  };
  const b = {
    tmdbId: 20002,
    kind: "movie" as const,
    name: "Import B",
    year: 2002,
    posterPath: null,
  };
  const c = {
    tmdbId: 20003,
    kind: "tv" as const,
    name: "Import C",
    year: 2003,
    posterPath: null,
  };

  const result = await importLibraryTitles(store, [a, b]);
  assert.deepEqual(result, { added: 2, alreadyOnList: 0 });

  const itemA = await findItem(store, 20001, "movie");
  assert.equal(itemA?.inLibrary, true);
  assert.equal(itemA?.shouldAcquire, false);
  assert.deepEqual(itemA?.services, []);
  assert.equal(itemA?.watched, false);
  assert.equal(itemA?.title.name, "Import A");

  // No coverage/Acquire deps on this path — importLibraryTitles takes none.
  const again = await importLibraryTitles(store, [a, b, c]);
  assert.deepEqual(again, { added: 1, alreadyOnList: 2 });
  assert.equal((await findItem(store, 20003, "tv"))?.inLibrary, true);
  assert.equal((await findItem(store, 20003, "tv"))?.shouldAcquire, false);

  const third = await importLibraryTitles(store, [a]);
  assert.deepEqual(third, { added: 0, alreadyOnList: 1 });
  assert.equal((await listItems(store)).filter((i) => i.title.tmdbId === 20001).length, 1);
});

test("importLibraryTitles backfills posterPath on already-on-list re-run", async () => {
  const bare = {
    tmdbId: 20010,
    kind: "movie" as const,
    name: "Posterless",
    year: 2010,
    posterPath: null,
  };
  await importLibraryTitles(store, [bare]);
  assert.equal((await findItem(store, 20010, "movie"))?.title.posterPath, null);

  const filled = await importLibraryTitles(store, [{ ...bare, posterPath: "/p.jpg" }]);
  assert.deepEqual(filled, { added: 0, alreadyOnList: 1 });
  assert.equal((await findItem(store, 20010, "movie"))?.title.posterPath, "/p.jpg");
});
