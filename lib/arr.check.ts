import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  arrAcquire,
  arrDrop,
  arrLibraryLookup,
  listRadarrLibrary,
  listSonarrLibrary,
  lookupInLibrary,
  movieDefaultsReady,
  parseRadarrMovies,
  parseSonarrSeries,
  seasonChoice,
  seriesDefaultsReady,
  tvdbIdForTmdb,
} from "./arr.ts";
import { openStore } from "./auth.ts";
import type { HttpDelete, HttpGet, HttpPost, HttpResult } from "./connect.ts";
import type { HouseholdSettings } from "./settings.ts";
import { addTitle, findItem, removeSeasons } from "./watchlist.ts";

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

test("season pick locks monitored seasons only when In Library", () => {
  const seasons = [1, 2, 3];
  assert.deepEqual(seasonChoice(seasons, seasons, false), { locked: [], choosable: seasons });
  assert.deepEqual(seasonChoice(seasons, [1], true), { locked: [1], choosable: [2, 3] });
  assert.deepEqual(seasonChoice(seasons, [1, 2], true), { locked: [1, 2], choosable: [3] });
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

test("Season Remove unmonitors chosen seasons, deletes only their files, and keeps the Item", async () => {
  const dir = mkdtempSync(join(tmpdir(), "watchirr-season-remove-"));
  const store = await openStore({ DATA_DIR: dir });
  const title = {
    tmdbId: 1396,
    kind: "tv" as const,
    name: "Breaking Bad",
    year: 2008,
    posterPath: null,
  };
  const files = [
    { id: 10, seasonNumber: 0 },
    { id: 11, seasonNumber: 1 },
    { id: 12, seasonNumber: 1 },
    { id: 21, seasonNumber: 2 },
    { id: 31, seasonNumber: 3 },
  ];

  function hit(monitored: number[], specials = false) {
    const held = new Set(monitored);
    return {
      id: 42,
      title: "Breaking Bad",
      seasons: [0, 1, 2, 3].map((seasonNumber) => ({
        seasonNumber,
        monitored: seasonNumber === 0 ? specials : held.has(seasonNumber),
      })),
    };
  }

  function flags(body: Record<string, unknown>) {
    return (body.seasons as { seasonNumber: number; monitored: boolean }[]).map((s) => ({
      n: s.seasonNumber,
      m: s.monitored,
    }));
  }

  function world(series: ReturnType<typeof hit>, opts?: { putFail?: boolean; delFail?: boolean }) {
    const puts: { url: string; body: Record<string, unknown> }[] = [];
    const dels: string[] = [];
    const gets: string[] = [];
    const read = fakeGet({
      "/tv/1396/external_ids": { status: 200, json: { tvdb_id: 81189 } },
      "/api/v3/series/lookup": {
        status: 200,
        json: [{ title: "Breaking Bad", id: 42, tvdbId: 81189 }],
      },
      "/api/v3/series/42": { status: 200, json: series },
      "/api/v3/episodefile": { status: 200, json: files },
    });
    const get: HttpGet = async (url, headers) => {
      gets.push(url);
      return read(url, headers);
    };
    const put: HttpPost = async (url, _h, body) => {
      puts.push({ url, body: body as Record<string, unknown> });
      if (opts?.putFail) return { status: 500, json: null };
      return { status: 202, json: body };
    };
    const del: HttpDelete = async (url) => {
      dels.push(url);
      if (opts?.delFail) return { status: 500, json: null };
      return { status: 200, json: {} };
    };
    return { puts, dels, gets, get, put, del };
  }

  async function stillThere() {
    const item = await findItem(store, 1396, "tv");
    assert.ok(item);
    assert.equal(item.inLibrary, true);
    assert.equal(item.title.name, "Breaking Bad");
  }

  try {
    const added = await addTitle(store, title, {
      coverage: async () => ({ ok: true, services: [] }),
      inLibrary: async () => ({ ok: true, inLibrary: true }),
    });
    assert.equal(added.ok, true);

    const emptyGets: string[] = [];
    const empty = await removeSeasons(
      store,
      1396,
      [],
      true,
      settings,
      async (url) => {
        emptyGets.push(url);
        return { error: "unreachable" };
      },
    );
    assert.deepEqual(empty, { ok: false, error: "missing-seasons" });
    assert.deepEqual(emptyGets, []);
    await stillThere();

    const idle = world(hit([1, 2]));
    const skipped = await removeSeasons(store, 1396, [3], true, settings, idle.get, idle.put, idle.del);
    assert.deepEqual(skipped, { ok: false, error: "missing-seasons" });
    assert.deepEqual(idle.puts, []);
    assert.deepEqual(idle.dels, []);
    await stillThere();

    const keep = world(hit([1, 2], true));
    const kept = await removeSeasons(store, 1396, [1], false, settings, keep.get, keep.put, keep.del);
    assert.deepEqual(kept, { ok: true });
    assert.equal(keep.puts[0]?.url, "http://sonarr:8989/api/v3/series/42");
    assert.deepEqual(flags(keep.puts[0]!.body), [
      { n: 0, m: true },
      { n: 1, m: false },
      { n: 2, m: true },
      { n: 3, m: false },
    ]);
    assert.equal(keep.puts.length, 1);
    assert.deepEqual(keep.dels, []);
    assert.equal(keep.gets.some((url) => url.includes("/api/v3/episodefile")), false);
    await stillThere();

    const drop = world(hit([1, 2]));
    const dropped = await removeSeasons(store, 1396, [1], true, settings, drop.get, drop.put, drop.del);
    assert.deepEqual(dropped, { ok: true });
    assert.deepEqual(flags(drop.puts[0]!.body), [
      { n: 0, m: false },
      { n: 1, m: false },
      { n: 2, m: true },
      { n: 3, m: false },
    ]);
    assert.deepEqual(drop.dels, [
      "http://sonarr:8989/api/v3/episodefile/11",
      "http://sonarr:8989/api/v3/episodefile/12",
    ]);
    await stillThere();

    const last = world(hit([1]));
    const lasted = await removeSeasons(store, 1396, [1], true, settings, last.get, last.put, last.del);
    assert.deepEqual(lasted, { ok: true });
    assert.deepEqual(flags(last.puts[0]!.body), [
      { n: 0, m: false },
      { n: 1, m: false },
      { n: 2, m: false },
      { n: 3, m: false },
    ]);
    assert.equal(last.puts.length, 1);
    assert.deepEqual(last.dels, [
      "http://sonarr:8989/api/v3/episodefile/11",
      "http://sonarr:8989/api/v3/episodefile/12",
    ]);
    assert.equal(last.dels.some((url) => url.includes("/api/v3/series/")), false);
    await stillThere();

    const broken = world(hit([1, 2]), { delFail: true });
    const failed = await removeSeasons(store, 1396, [1, 2], true, settings, broken.get, broken.put, broken.del);
    assert.deepEqual(failed, { ok: false, error: "arr-failed" });
    assert.deepEqual(broken.dels, ["http://sonarr:8989/api/v3/episodefile/11"]);
    assert.equal(broken.puts.length, 2);
    assert.deepEqual(flags(broken.puts[1]!.body), [
      { n: 0, m: false },
      { n: 1, m: true },
      { n: 2, m: true },
      { n: 3, m: false },
    ]);
    await stillThere();

    const stuck = world(hit([1, 2]), { putFail: true });
    const unmonitor = await removeSeasons(store, 1396, [1], true, settings, stuck.get, stuck.put, stuck.del);
    assert.deepEqual(unmonitor, { ok: false, error: "arr-failed" });
    assert.deepEqual(stuck.dels, []);
    assert.equal(stuck.puts.length, 1);
    assert.equal(stuck.gets.some((url) => url.includes("/api/v3/episodefile")), false);
    await stillThere();
  } finally {
    await store.close();
    rmSync(dir, { recursive: true, force: true });
  }
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

test("parseSonarrSeries maps TV Titles and skips missing TMDB id", () => {
  const { titles, skippedNoTmdb } = parseSonarrSeries([
    { title: "Breaking Bad", tmdbId: 1396, year: 2008 },
    { title: "TVDB only", tvdbId: 81189, year: 2008 },
    { title: "The Wire", tmdbId: 1438, year: 2002, originalTitle: "The Wire" },
    { tmdbId: 0, title: "Zero id" },
  ]);
  assert.equal(skippedNoTmdb, 2);
  assert.deepEqual(titles, [
    { tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: null },
    { tmdbId: 1438, kind: "tv", name: "The Wire", year: 2002, posterPath: null },
  ]);
});

test("listSonarrLibrary GETs /api/v3/series and surfaces unreachable", async () => {
  const get = fakeGet({
    "/api/v3/series": {
      status: 200,
      json: [
        { title: "Breaking Bad", tmdbId: 1396, year: 2008 },
        { title: "Orphan", tvdbId: 1, year: 2010 },
      ],
    },
  });
  const listed = await listSonarrLibrary(settings, get);
  assert.equal(listed.ok, true);
  if (!listed.ok) return;
  assert.equal(listed.skippedNoTmdb, 1);
  assert.deepEqual(listed.titles, [
    { tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: null },
  ]);

  const down = await listSonarrLibrary(settings, async () => ({ error: "unreachable" }));
  assert.deepEqual(down, { ok: false, error: "arr-unreachable" });

  const denied = await listSonarrLibrary(settings, async () => ({ status: 401, json: null }));
  assert.deepEqual(denied, { ok: false, error: "arr-unauthorized" });

  const bare = await listSonarrLibrary({
    sonarr: { ...settings.sonarr, url: "", apiKey: "" },
  });
  assert.deepEqual(bare, { ok: false, error: "missing-defaults" });
});
