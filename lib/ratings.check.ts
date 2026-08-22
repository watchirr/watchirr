import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { openStore } from "./auth.ts";
import {
  absentRatings,
  getRatingsCache,
  isFresh,
  parseImdbRating,
  parseOmdbRatings,
  parseTomatometer,
  pickFeatured,
  putRatingsCache,
  RATINGS_NEGATIVE_TTL_MS,
  RATINGS_TTL_MS,
  resolveMany,
  resolvePublicRatings,
  titleKey,
  type ImdbLookup,
  type OmdbFetch,
  type RatingsCache,
} from "./ratings.ts";

const dir = mkdtempSync(join(tmpdir(), "watchirr-ratings-"));
const store = await openStore({ DATA_DIR: dir });

after(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

const fight = { tmdbId: 550, kind: "movie" as const };

test("parse ImDb / Tomatometer; unknown is null not zero", () => {
  assert.equal(parseImdbRating("8.8"), 8.8);
  assert.equal(parseImdbRating("N/A"), null);
  assert.equal(parseImdbRating(""), null);
  assert.equal(parseTomatometer("87%"), 87);
  assert.equal(parseTomatometer("N/A"), null);
  assert.equal(parseTomatometer("bad"), null);
  assert.deepEqual(parseOmdbRatings({ Response: "False", Error: "not found" }), absentRatings);
  assert.deepEqual(
    parseOmdbRatings({
      Response: "True",
      imdbRating: "8.8",
      Ratings: [
        { Source: "Internet Movie Database", Value: "8.8/10" },
        { Source: "Rotten Tomatoes", Value: "87%" },
      ],
    }),
    { imdb: 8.8, tomato: 87 },
  );
  assert.deepEqual(
    parseOmdbRatings({ Response: "True", imdbRating: "7.1", Ratings: [] }),
    { imdb: 7.1, tomato: null },
  );
});

test("no OMDb key → both absent; app does not throw", async () => {
  const cache: RatingsCache = {};
  const ratings = await resolvePublicRatings(fight, {
    omdbApiKey: "",
    tmdbApiKey: "tmdb",
    cache,
    save: async () => {
      throw new Error("should not save");
    },
    imdbLookup: async () => {
      throw new Error("should not lookup");
    },
    omdbFetch: async () => {
      throw new Error("should not fetch");
    },
  });
  assert.deepEqual(ratings, absentRatings);
});

test("with key: resolve returns scores; one missing stays null not 0", async () => {
  const cache: RatingsCache = {};
  const box: { saved: RatingsCache | null } = { saved: null };
  const imdbLookup: ImdbLookup = async () => ({ ok: true, imdbId: "tt0137523" });
  const omdbFetch: OmdbFetch = async () => ({ ok: true, ratings: { imdb: 8.8, tomato: null } });

  const ratings = await resolvePublicRatings(fight, {
    omdbApiKey: "omdb",
    tmdbApiKey: "tmdb",
    cache,
    save: async (c) => {
      box.saved = structuredClone(c);
    },
    imdbLookup,
    omdbFetch,
    now: () => 1_000,
  });
  assert.deepEqual(ratings, { imdb: 8.8, tomato: null });
  assert.ok(box.saved);
  assert.deepEqual(box.saved[titleKey(fight)].ratings, { imdb: 8.8, tomato: null });
  assert.equal(box.saved[titleKey(fight)].absent, false);
});

test("cache keeps last-known across TTL until successful refresh; failure keeps last-known", async () => {
  const key = titleKey(fight);
  const cache: RatingsCache = {
    [key]: {
      ratings: { imdb: 8.0, tomato: 80 },
      fetchedAt: 0,
      absent: false,
    },
  };

  assert.equal(isFresh(cache[key]!, RATINGS_TTL_MS - 1), true);

  // Stale + failed refresh → last-known
  let calls = 0;
  const failed = await resolvePublicRatings(fight, {
    omdbApiKey: "omdb",
    tmdbApiKey: "tmdb",
    cache,
    save: async () => {
      throw new Error("should not save on failure");
    },
    imdbLookup: async () => {
      calls += 1;
      return { ok: true, imdbId: "tt0137523" };
    },
    omdbFetch: async () => ({ ok: false }),
    now: () => RATINGS_TTL_MS + 1,
  });
  assert.equal(calls, 1);
  assert.deepEqual(failed, { imdb: 8.0, tomato: 80 });

  // Stale + successful refresh → replace
  const replaced = await resolvePublicRatings(fight, {
    omdbApiKey: "omdb",
    tmdbApiKey: "tmdb",
    cache,
    save: async () => {},
    imdbLookup: async () => ({ ok: true, imdbId: "tt0137523" }),
    omdbFetch: async () => ({ ok: true, ratings: { imdb: 9.0, tomato: 90 } }),
    now: () => RATINGS_TTL_MS + 2,
  });
  assert.deepEqual(replaced, { imdb: 9.0, tomato: 90 });
  assert.deepEqual(cache[key]!.ratings, { imdb: 9.0, tomato: 90 });
});

test("fresh cache skips network", async () => {
  const key = titleKey(fight);
  const cache: RatingsCache = {
    [key]: {
      ratings: { imdb: 7.5, tomato: 70 },
      fetchedAt: 100,
      absent: false,
    },
  };
  const ratings = await resolvePublicRatings(fight, {
    omdbApiKey: "omdb",
    tmdbApiKey: "tmdb",
    cache,
    save: async () => {
      throw new Error("no save");
    },
    imdbLookup: async () => {
      throw new Error("no lookup");
    },
    omdbFetch: async () => {
      throw new Error("no fetch");
    },
    now: () => 100 + RATINGS_TTL_MS - 1,
  });
  assert.deepEqual(ratings, { imdb: 7.5, tomato: 70 });
});

test("negative cache uses shorter TTL; confirmed absence is not 0", async () => {
  const key = titleKey(fight);
  const cache: RatingsCache = {};
  await resolvePublicRatings(fight, {
    omdbApiKey: "omdb",
    tmdbApiKey: "tmdb",
    cache,
    save: async () => {},
    imdbLookup: async () => ({ ok: true, imdbId: "tt0137523" }),
    omdbFetch: async () => ({ ok: true, ratings: { ...absentRatings } }),
    now: () => 0,
  });
  assert.equal(cache[key]!.absent, true);
  assert.deepEqual(cache[key]!.ratings, absentRatings);
  assert.equal(isFresh(cache[key]!, RATINGS_NEGATIVE_TTL_MS - 1), true);
  assert.equal(isFresh(cache[key]!, RATINGS_NEGATIVE_TTL_MS + 1), false);
});

test("ratings cache persists on the store", async () => {
  const cache: RatingsCache = {
    "movie:550": { ratings: { imdb: 8.8, tomato: 87 }, fetchedAt: 42, absent: false },
  };
  await putRatingsCache(store, cache);
  const loaded = await getRatingsCache(store);
  assert.deepEqual(loaded["movie:550"]?.ratings, { imdb: 8.8, tomato: 87 });
});

test("Still-to-watch featuring: highest Tomatometer; tie → last added; unscored → last added; featured omitted from rail", () => {
  const a = { key: "movie:1", tomato: 90, addedAt: 1 };
  const b = { key: "movie:2", tomato: 95, addedAt: 2 };
  const c = { key: "movie:3", tomato: 95, addedAt: 5 };
  const d = { key: "movie:4", tomato: null, addedAt: 9 };

  const high = pickFeatured([a, b, c, d], true);
  assert.equal(high.featuredKey, "movie:3");
  assert.deepEqual(high.remainderKeys, ["movie:4", "movie:2", "movie:1"]);

  const unscored = pickFeatured(
    [
      { key: "movie:1", tomato: null, addedAt: 1 },
      { key: "movie:2", tomato: null, addedAt: 3 },
    ],
    true,
  );
  assert.equal(unscored.featuredKey, "movie:2");
  assert.deepEqual(unscored.remainderKeys, ["movie:1"]);
});

test("resolveMany budgetMs skips remaining network lookups", async () => {
  let t = 0;
  let lookups = 0;
  const titles = [1, 2, 3, 4].map((n) => ({ tmdbId: n, kind: "movie" as const }));
  const map = await resolveMany(titles, {
    omdbApiKey: "k",
    tmdbApiKey: "k",
    cache: {},
    save: async () => {},
    now: () => t,
    imdbLookup: async () => {
      lookups += 1;
      t += 1000;
      return { ok: false };
    },
  }, { budgetMs: 2500 });
  assert.equal(lookups, 3);
  assert.equal(map.size, 4);
  assert.deepEqual(map.get("movie:4"), absentRatings);
});

test("Coming in / Watched featuring ignores Tomatometer (last added only)", () => {
  const pick = pickFeatured(
    [
      { key: "movie:low", tomato: 99, addedAt: 1 },
      { key: "movie:new", tomato: 10, addedAt: 9 },
    ],
    false,
  );
  assert.equal(pick.featuredKey, "movie:new");
  assert.deepEqual(pick.remainderKeys, ["movie:low"]);
});
