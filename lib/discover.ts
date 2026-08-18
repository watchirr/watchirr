import { classify, defaultGet, TMDB, type HttpGet } from "./connect.ts";
import { num } from "./settings.ts";
import { parseSearchResults, type KindFilter, type SearchError, type Title, type TitleKind } from "./tmdb.ts";

export type DiscoverRailId = "trending" | "popular" | "just-released" | "upcoming";

export const DISCOVER_RAILS: DiscoverRailId[] = ["trending", "popular", "just-released", "upcoming"];

export function isDiscoverRailId(value: string): value is DiscoverRailId {
  return (DISCOVER_RAILS as readonly string[]).includes(value);
}

export function discoverListPath(rail: DiscoverRailId, page = 1): string {
  const path = `/search/${rail}`;
  return Number.isInteger(page) && page > 1 ? `${path}?page=${page}` : path;
}

export type DiscoverInput = {
  apiKey: string;
  language: string;
  filter: KindFilter;
  country: string;
  rail: DiscoverRailId;
  page: number;
  /** ponytail: inject clock so 30/90-day rails are testable; UTC calendar days. */
  now?: Date;
};

export type DiscoverResult =
  | { ok: true; titles: Title[]; page: number; totalPages: number | null; hasNext: boolean }
  | { ok: false; error: SearchError };

type Loaded = { titles: Title[]; totalPages: number | null } | { error: SearchError };

function tmdbUrl(apiKey: string, path: string, extra: Record<string, string>): string {
  return `${TMDB}${path}?${new URLSearchParams({ api_key: apiKey.trim(), ...extra })}`;
}

function ymd(now: Date, days: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days)).toISOString().slice(0, 10);
}

function zip(movies: Title[], shows: Title[]): Title[] {
  const out: Title[] = [];
  for (let i = 0, n = Math.max(movies.length, shows.length); i < n; i++) {
    if (i < movies.length) out.push(movies[i]!);
    if (i < shows.length) out.push(shows[i]!);
  }
  return out;
}

function pageOf(input: DiscoverInput): number {
  return Number.isInteger(input.page) && input.page > 0 ? input.page : 1;
}

function ok(page: number, titles: Title[], totalPages: number | null): DiscoverResult {
  return { ok: true, titles, page, totalPages, hasNext: totalPages != null && page < totalPages };
}

async function load(
  apiKey: string,
  path: string,
  extra: Record<string, string>,
  forced: TitleKind | undefined,
  get: HttpGet,
): Promise<Loaded> {
  const res = await get(tmdbUrl(apiKey, path, extra), { Accept: "application/json" });
  const status = classify(res);
  if (status !== "ok") return { error: status };
  const json = "error" in res ? null : res.json;
  return {
    // ponytail: date Discover is a TMDB firehose of unreleased/regional rows with no art; drop those so rails are poster-first. Typed Search still keeps no-poster hits.
    titles: parseSearchResults(json, forced).filter((t) => t.posterPath),
    totalPages: json && typeof json === "object" ? num((json as { total_pages?: unknown }).total_pages) : null,
  };
}

async function one(
  apiKey: string,
  page: number,
  path: string,
  extra: Record<string, string>,
  forced: TitleKind | undefined,
  get: HttpGet,
): Promise<DiscoverResult> {
  const loaded = await load(apiKey, path, extra, forced, get);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  return ok(page, loaded.titles, loaded.totalPages);
}

async function mixed(
  apiKey: string,
  filter: KindFilter,
  page: number,
  movie: { path: string; extra: Record<string, string> },
  tv: { path: string; extra: Record<string, string> },
  get: HttpGet,
): Promise<DiscoverResult> {
  if (filter !== "all") {
    const spec = filter === "movie" ? movie : tv;
    return one(apiKey, page, spec.path, spec.extra, filter, get);
  }
  const [movies, shows] = await Promise.all([
    load(apiKey, movie.path, movie.extra, "movie", get),
    load(apiKey, tv.path, tv.extra, "tv", get),
  ]);
  if ("error" in movies) return { ok: false, error: movies.error };
  if ("error" in shows) return { ok: false, error: shows.error };
  const totals = [movies.totalPages, shows.totalPages].filter((n): n is number => n != null);
  return ok(page, zip(movies.titles, shows.titles), totals.length ? Math.max(...totals) : null);
}

function langPage(language: string, page: number, region = ""): Record<string, string> {
  const extra: Record<string, string> = { language, page: String(page) };
  if (region) extra.region = region;
  return extra;
}

export async function discoverCatalog(input: DiscoverInput, get: HttpGet = defaultGet): Promise<DiscoverResult> {
  const apiKey = input.apiKey.trim();
  if (!apiKey) return { ok: false, error: "missing-key" };

  const page = pageOf(input);
  const { language, filter, rail } = input;
  const country = input.country.trim().toUpperCase();
  const region = country.length === 2 ? country : "";
  const now = input.now ?? new Date();

  if (rail === "trending") {
    const path = filter === "all" ? "/trending/all/week" : `/trending/${filter}/week`;
    return one(apiKey, page, path, langPage(language, page), filter === "all" ? undefined : filter, get);
  }

  const popular = langPage(language, page, region);
  if (rail === "popular") {
    return mixed(apiKey, filter, page, { path: "/movie/popular", extra: popular }, { path: "/tv/popular", extra: popular }, get);
  }

  // ponytail: Just released owns today; Upcoming starts tomorrow so a same-day Title is not on both rails.
  const released = rail === "just-released";
  const gte = ymd(now, released ? -30 : 1);
  const lte = ymd(now, released ? 0 : 90);
  const sort = released ? "desc" : "asc";
  return mixed(
    apiKey,
    filter,
    page,
    {
      path: "/discover/movie",
      extra: {
        ...langPage(language, page, region),
        include_adult: "false",
        sort_by: `primary_release_date.${sort}`,
        "primary_release_date.gte": gte,
        "primary_release_date.lte": lte,
      },
    },
    {
      path: "/discover/tv",
      extra: {
        ...langPage(language, page),
        include_adult: "false",
        include_null_first_air_dates: "false",
        sort_by: `first_air_date.${sort}`,
        "first_air_date.gte": gte,
        "first_air_date.lte": lte,
      },
    },
    get,
  );
}
