import { classify, defaultGet, TMDB, type HttpGet, type ProbeError } from "./connect.ts";
import { num, str } from "./settings.ts";

export type TitleKind = "movie" | "tv";

export type Title = {
  tmdbId: number;
  kind: TitleKind;
  name: string;
  year: number | null;
  posterPath: string | null;
};

export type Person = {
  tmdbId: number;
  name: string;
  profilePath: string | null;
  department: string | null;
};

export type SearchError = ProbeError | "missing-key";
export type SearchResult = { ok: true; titles: Title[] } | { ok: false; error: SearchError };
export type PeopleResult = { ok: true; people: Person[] } | { ok: false; error: SearchError };
export type CastResult = { ok: true; person: Person; titles: Title[] } | { ok: false; error: SearchError };

export const PERSON_CAP = 8;
export const CAST_CAP = 40;

export type KindFilter = "all" | TitleKind;
export const KIND_META = "titleKind";

export function isTitleKind(value: unknown): value is TitleKind {
  return value === "movie" || value === "tv";
}

export function parseKindFilter(value: unknown): KindFilter {
  return isTitleKind(value) ? value : "all";
}

export function parseTitleRef(tmdb: unknown, kind: unknown): { tmdbId: number; kind: TitleKind } | null {
  const tmdbId = num(tmdb);
  return tmdbId && isTitleKind(kind) ? { tmdbId, kind } : null;
}

export function posterUrl(path: string | null, size: "w185" | "w342" = "w185"): string | null {
  if (!path) return null;
  return `https://image.tmdb.org/t/p/${size}${path.startsWith("/") ? path : `/${path}`}`;
}

function yearFrom(date: string): number | null {
  return /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null;
}

function titleFrom(o: Record<string, unknown>, kind: TitleKind): Title | null {
  const tmdbId = num(o.id);
  const name = kind === "movie" ? str(o.title) || str(o.name) : str(o.name) || str(o.title);
  if (!tmdbId || !name) return null;
  const date = kind === "movie" ? str(o.release_date) : str(o.first_air_date);
  return { tmdbId, kind, name, year: yearFrom(date), posterPath: str(o.poster_path) || null };
}

function personFrom(o: Record<string, unknown>): Person | null {
  const tmdbId = num(o.id);
  const name = str(o.name);
  if (!tmdbId || !name) return null;
  return {
    tmdbId,
    name,
    profilePath: str(o.profile_path) || null,
    department: str(o.known_for_department) || null,
  };
}

function tmdbUrl(apiKey: string, path: string, extra: Record<string, string>): string {
  return `${TMDB}${path}?${new URLSearchParams({ api_key: apiKey.trim(), ...extra })}`;
}

function resultsOf(json: unknown): unknown[] {
  return json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results)
    ? (json as { results: unknown[] }).results
    : [];
}

export function parseSearchResults(json: unknown, forced?: TitleKind): Title[] {
  const out: Title[] = [];
  for (const row of resultsOf(json)) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const kind = forced ?? (isTitleKind(o.media_type) ? o.media_type : null);
    if (!kind) continue;
    const title = titleFrom(o, kind);
    if (title) out.push(title);
  }
  return out;
}

export function parsePersonResults(json: unknown, cap = PERSON_CAP): Person[] {
  const out: Person[] = [];
  for (const row of resultsOf(json)) {
    if (out.length >= cap) break;
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const person = personFrom(o);
    if (person) out.push(person);
  }
  return out;
}

export function parseCastCredits(json: unknown, cap = CAST_CAP, filter: KindFilter = "all"): Title[] {
  const rows =
    json && typeof json === "object" && Array.isArray((json as { cast?: unknown }).cast)
      ? (json as { cast: unknown[] }).cast
      : [];
  const scored: { title: Title; pop: number }[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    if (!isTitleKind(o.media_type)) continue;
    if (filter !== "all" && o.media_type !== filter) continue;
    const title = titleFrom(o, o.media_type);
    if (!title) continue;
    const key = `${title.kind}-${title.tmdbId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const pop = typeof o.popularity === "number" && Number.isFinite(o.popularity) ? o.popularity : 0;
    scored.push({ title, pop });
  }
  scored.sort((a, b) => b.pop - a.pop);
  return scored.slice(0, cap).map((s) => s.title);
}

export function parsePerson(json: unknown): Person | null {
  if (!json || typeof json !== "object") return null;
  return personFrom(json as Record<string, unknown>);
}

export async function searchTitles(
  apiKey: string,
  query: string,
  language: string,
  filter: KindFilter = "all",
  get: HttpGet = defaultGet,
): Promise<SearchResult> {
  if (!apiKey.trim()) return { ok: false, error: "missing-key" };
  const q = query.trim();
  if (!q) return { ok: true, titles: [] };
  const path = filter === "movie" ? "/search/movie" : filter === "tv" ? "/search/tv" : "/search/multi";
  const res = await get(tmdbUrl(apiKey, path, { query: q, include_adult: "false", language }), {
    Accept: "application/json",
  });
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: status };
  const forced = filter === "all" ? undefined : filter;
  return { ok: true, titles: parseSearchResults("error" in res ? null : res.json, forced) };
}

export async function searchPeople(
  apiKey: string,
  query: string,
  language: string,
  get: HttpGet = defaultGet,
): Promise<PeopleResult> {
  if (!apiKey.trim()) return { ok: false, error: "missing-key" };
  const q = query.trim();
  if (!q) return { ok: true, people: [] };
  const res = await get(tmdbUrl(apiKey, "/search/person", { query: q, include_adult: "false", language }), {
    Accept: "application/json",
  });
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: status };
  return { ok: true, people: parsePersonResults("error" in res ? null : res.json) };
}

export async function personCast(
  apiKey: string,
  personId: number,
  language: string,
  filter: KindFilter = "all",
  get: HttpGet = defaultGet,
): Promise<CastResult> {
  if (!apiKey.trim()) return { ok: false, error: "missing-key" };
  if (!personId) return { ok: false, error: "failed" };
  const extra = { language };
  const [who, credits] = await Promise.all([
    get(tmdbUrl(apiKey, `/person/${personId}`, extra), { Accept: "application/json" }),
    get(tmdbUrl(apiKey, `/person/${personId}/combined_credits`, extra), { Accept: "application/json" }),
  ]);
  const p = classify(who);
  if (p !== "ok") return { ok: false, error: p };
  const person = parsePerson("error" in who ? null : who.json);
  if (!person) return { ok: false, error: "failed" };
  const c = classify(credits);
  const titles = c === "ok" && !("error" in credits) ? parseCastCredits(credits.json, CAST_CAP, filter) : [];
  return { ok: true, person, titles };
}
