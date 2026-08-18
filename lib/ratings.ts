import type { Store } from "./auth.ts";
import { classify, defaultGet, TMDB, type HttpGet } from "./connect.ts";
import { num, str } from "./settings.ts";
import type { Title, TitleKind } from "./tmdb.ts";

export const RATINGS_META = "ratings";

/** Positive cache TTL — refresh-eligible, not eviction (ADR 0017). */
export const RATINGS_TTL_MS = 24 * 60 * 60 * 1000;
/** Shorter negative cache when OMDb confirmed both scores absent. */
export const RATINGS_NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;

export const OMDB = "https://www.omdbapi.com/";

export type PublicRatings = {
  imdb: number | null;
  tomato: number | null;
};

export type RatingsCacheEntry = {
  ratings: PublicRatings;
  fetchedAt: number;
  /** True when both slots confirmed absent (negative cache). */
  absent: boolean;
};

export type RatingsCache = Record<string, RatingsCacheEntry>;

export type TitleRef = { tmdbId: number; kind: TitleKind };

export type ImdbLookup = (
  title: TitleRef,
) => Promise<{ ok: true; imdbId: string } | { ok: false }>;

export type OmdbFetch = (
  imdbId: string,
) => Promise<{ ok: true; ratings: PublicRatings } | { ok: false }>;

export type FeatureCandidate = {
  key: string;
  tomato: number | null;
  addedAt: number;
};

export type FeaturePick = {
  featuredKey: string | null;
  remainderKeys: string[];
};

export const absentRatings: PublicRatings = { imdb: null, tomato: null };

export function titleKey(title: TitleRef): string {
  return `${title.kind}:${title.tmdbId}`;
}

export function parseImdbRating(raw: unknown): number | null {
  const s = str(raw);
  if (!s || s === "N/A") return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseTomatometer(raw: unknown): number | null {
  const s = str(raw);
  if (!s || s === "N/A") return null;
  const m = /^(\d+(?:\.\d+)?)\s*%$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export function parseOmdbRatings(json: unknown): PublicRatings | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (str(o.Response) === "False") return { ...absentRatings };
  const imdb = parseImdbRating(o.imdbRating);
  let tomato: number | null = null;
  const rows = Array.isArray(o.Ratings) ? o.Ratings : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (str(r.Source) === "Rotten Tomatoes") {
      tomato = parseTomatometer(r.Value);
      break;
    }
  }
  return { imdb, tomato };
}

export function parseRatingsCache(raw: string | null | undefined): RatingsCache {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: RatingsCache = {};
    for (const [key, entry] of Object.entries(v as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const ratingsRaw = e.ratings;
      if (!ratingsRaw || typeof ratingsRaw !== "object") continue;
      const r = ratingsRaw as Record<string, unknown>;
      const fetchedAt = typeof e.fetchedAt === "number" && Number.isFinite(e.fetchedAt) ? e.fetchedAt : 0;
      if (!fetchedAt) continue;
      const imdb = r.imdb == null ? null : typeof r.imdb === "number" && Number.isFinite(r.imdb) ? r.imdb : null;
      const tomato =
        r.tomato == null ? null : typeof r.tomato === "number" && Number.isFinite(r.tomato) ? r.tomato : null;
      out[key] = {
        ratings: { imdb, tomato },
        fetchedAt,
        absent: e.absent === true || (imdb == null && tomato == null),
      };
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeRatingsCache(cache: RatingsCache): string {
  return JSON.stringify(cache);
}

export async function getRatingsCache(store: Store): Promise<RatingsCache> {
  return parseRatingsCache(await store.getMeta(RATINGS_META));
}

export async function putRatingsCache(store: Store, cache: RatingsCache): Promise<void> {
  await store.setMeta(RATINGS_META, serializeRatingsCache(cache));
}

function ttlFor(entry: RatingsCacheEntry): number {
  return entry.absent ? RATINGS_NEGATIVE_TTL_MS : RATINGS_TTL_MS;
}

export function isFresh(entry: RatingsCacheEntry, now: number): boolean {
  return now - entry.fetchedAt < ttlFor(entry);
}

export async function imdbIdForTmdb(
  apiKey: string,
  title: TitleRef,
  get: HttpGet = defaultGet,
): Promise<{ ok: true; imdbId: string } | { ok: false }> {
  if (!apiKey.trim()) return { ok: false };
  const path = title.kind === "movie" ? `/movie/${title.tmdbId}/external_ids` : `/tv/${title.tmdbId}/external_ids`;
  const url = `${TMDB}${path}?${new URLSearchParams({ api_key: apiKey.trim() })}`;
  const res = await get(url, { Accept: "application/json" });
  if (classify(res) !== "ok") return { ok: false };
  const imdbId = "error" in res ? "" : str((res.json as { imdb_id?: unknown } | null)?.imdb_id);
  if (!imdbId || !/^tt\d+$/i.test(imdbId)) return { ok: false };
  return { ok: true, imdbId };
}

export async function fetchOmdbRatings(
  apiKey: string,
  imdbId: string,
  get: HttpGet = defaultGet,
): Promise<{ ok: true; ratings: PublicRatings } | { ok: false }> {
  if (!apiKey.trim() || !imdbId.trim()) return { ok: false };
  const url = `${OMDB}?${new URLSearchParams({ i: imdbId.trim(), apikey: apiKey.trim() })}`;
  const res = await get(url, { Accept: "application/json" });
  if (classify(res) !== "ok") return { ok: false };
  const ratings = parseOmdbRatings("error" in res ? null : res.json);
  if (!ratings) return { ok: false };
  return { ok: true, ratings };
}

export type ResolveDeps = {
  omdbApiKey: string;
  tmdbApiKey: string;
  cache: RatingsCache;
  save: (cache: RatingsCache) => Promise<void>;
  imdbLookup?: ImdbLookup;
  omdbFetch?: OmdbFetch;
  now?: () => number;
  get?: HttpGet;
};

/**
 * Public Ratings seam: resolve IMDb + Tomatometer for a Title.
 * No OMDb key → both absent. Cache is stale-while-revalidate (ADR 0017).
 */
export async function resolvePublicRatings(title: TitleRef, deps: ResolveDeps): Promise<PublicRatings> {
  const key = titleKey(title);
  const now = (deps.now ?? Date.now)();
  const cached = deps.cache[key];

  if (!deps.omdbApiKey.trim()) {
    return { ...absentRatings };
  }

  if (cached && isFresh(cached, now)) {
    return cached.ratings;
  }

  const lastKnown = cached?.ratings;

  const lookup: ImdbLookup =
    deps.imdbLookup ??
    ((ref) => imdbIdForTmdb(deps.tmdbApiKey, ref, deps.get ?? defaultGet));
  const omdb: OmdbFetch =
    deps.omdbFetch ??
    ((id) => fetchOmdbRatings(deps.omdbApiKey, id, deps.get ?? defaultGet));

  const imdb = await lookup(title);
  if (!imdb.ok) {
    return lastKnown ?? { ...absentRatings };
  }

  const fetched = await omdb(imdb.imdbId);
  if (!fetched.ok) {
    return lastKnown ?? { ...absentRatings };
  }

  const entry: RatingsCacheEntry = {
    ratings: fetched.ratings,
    fetchedAt: now,
    absent: fetched.ratings.imdb == null && fetched.ratings.tomato == null,
  };
  deps.cache[key] = entry;
  await deps.save(deps.cache);
  return entry.ratings;
}

export async function resolveMany(
  titles: TitleRef[],
  deps: ResolveDeps,
): Promise<Map<string, PublicRatings>> {
  const out = new Map<string, PublicRatings>();
  for (const title of titles) {
    out.set(titleKey(title), await resolvePublicRatings(title, deps));
  }
  return out;
}

/**
 * Still-to-watch featuring: highest Tomatometer; ties → last added; none scored → last added.
 * Remainder stays last-added order and never includes the featured key.
 * Coming in / Watched: pass useTomato=false (last added only).
 */
export function pickFeatured(candidates: FeatureCandidate[], useTomato: boolean): FeaturePick {
  if (candidates.length === 0) return { featuredKey: null, remainderKeys: [] };

  const byAdded = [...candidates].sort((a, b) => b.addedAt - a.addedAt);

  let featured: FeatureCandidate;
  if (useTomato) {
    const scored = byAdded.filter((c) => c.tomato != null);
    featured = scored.length === 0
      ? byAdded[0]!
      : scored.reduce((best, c) => {
          const bt = best.tomato!;
          const ct = c.tomato!;
          if (ct > bt) return c;
          if (ct < bt) return best;
          return c.addedAt > best.addedAt ? c : best;
        });
  } else {
    featured = byAdded[0]!;
  }

  return {
    featuredKey: featured.key,
    remainderKeys: byAdded.filter((c) => c.key !== featured.key).map((c) => c.key),
  };
}

export function ratingsDepsFromStore(
  store: Store,
  settings: { omdbApiKey: string; tmdbApiKey: string },
  cache: RatingsCache,
  get?: HttpGet,
): ResolveDeps {
  return {
    omdbApiKey: settings.omdbApiKey,
    tmdbApiKey: settings.tmdbApiKey,
    cache,
    save: (next) => putRatingsCache(store, next),
    get,
  };
}

/** Convenience when Title objects are already loaded. */
export function asRef(title: Pick<Title, "tmdbId" | "kind">): TitleRef {
  return { tmdbId: title.tmdbId, kind: title.kind };
}
