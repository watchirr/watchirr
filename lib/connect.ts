import type { HouseholdSettings } from "./settings.ts";
import { num, str } from "./settings.ts";

export type ProbeError = "unreachable" | "unauthorized" | "failed";

export type HttpResult = { status: number; json: unknown } | { error: "unreachable" };
export type HttpGet = (url: string, headers: Record<string, string>) => Promise<HttpResult>;
export type HttpPost = (
  url: string,
  headers: Record<string, string>,
  body: unknown,
) => Promise<HttpResult>;
export type HttpPut = HttpPost;

export type NamedId = { id: number; name: string };
export type ArrLists = {
  ready: boolean;
  qualityProfiles: NamedId[];
  rootFolders: { path: string }[];
  languageProfiles: NamedId[] | null;
};

export type Probe<T> = { ok: true; skipped?: boolean; data: T } | { ok: false; error: ProbeError };

export type HouseholdLists = {
  tmdbReady: boolean;
  countries: { code: string; name: string }[];
  providers: NamedId[];
  radarr: ArrLists;
  sonarr: ArrLists;
  errors: {
    tmdb?: ProbeError;
    radarr?: ProbeError;
    sonarr?: ProbeError;
    jellyfin?: ProbeError;
  };
};

const TIMEOUT_MS = 4000;
export const TMDB = "https://api.themoviedb.org/3";

function blankArr(): ArrLists {
  return { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null };
}

export function joinUrl(base: string, path: string): string {
  const b = base.trim().replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

export async function defaultGet(url: string, headers: Record<string, string>): Promise<HttpResult> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { error: "unreachable" };
  }
}

export async function defaultPost(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<HttpResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { error: "unreachable" };
  }
}

export async function defaultPut(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<HttpResult> {
  try {
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return { error: "unreachable" };
  }
}

export function classify(res: HttpResult): "ok" | ProbeError {
  if ("error" in res) return "unreachable";
  if (res.status === 401 || res.status === 403) return "unauthorized";
  if (res.status >= 200 && res.status < 300) return "ok";
  return "failed";
}

function okJson(res: HttpResult): unknown | undefined {
  if ("error" in res || res.status < 200 || res.status >= 300) return undefined;
  return res.json;
}

function namedIds(json: unknown, idKey: string, nameKey: string): NamedId[] {
  if (!Array.isArray(json)) return [];
  const out: NamedId[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const id = num(o[idKey]);
    const name = str(o[nameKey]);
    if (id && name) out.push({ id, name });
  }
  return out;
}

function rootPaths(json: unknown): { path: string }[] {
  if (!Array.isArray(json)) return [];
  const out: { path: string }[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const path = str((row as { path?: unknown }).path);
    if (path) out.push({ path });
  }
  return out;
}

export function mergeProviders(movie: unknown, tv: unknown): NamedId[] {
  const map = new Map<number, string>();
  for (const blob of [movie, tv]) {
    const rows =
      blob && typeof blob === "object" && Array.isArray((blob as { results?: unknown }).results)
        ? (blob as { results: unknown[] }).results
        : Array.isArray(blob)
          ? blob
          : [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const o = row as Record<string, unknown>;
      const id = num(o.provider_id);
      const name = str(o.provider_name);
      if (id && name) map.set(id, name);
    }
  }
  return [...map.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function parseRegions(json: unknown): { code: string; name: string }[] {
  const rows =
    json && typeof json === "object" && Array.isArray((json as { results?: unknown }).results)
      ? (json as { results: unknown[] }).results
      : Array.isArray(json)
        ? json
        : [];
  const out: { code: string; name: string }[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const code = str(o.iso_3166_1).toUpperCase();
    const name = str(o.native_name) || str(o.english_name) || code;
    if (code.length === 2) out.push({ code, name });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export async function probeArr(
  kind: "radarr" | "sonarr",
  url: string,
  apiKey: string,
  get: HttpGet = defaultGet,
): Promise<Probe<ArrLists>> {
  if (!url.trim() || !apiKey.trim()) return { ok: true, skipped: true, data: blankArr() };
  const headers = { "X-Api-Key": apiKey.trim(), Accept: "application/json" };
  const [profiles, folders, langs] = await Promise.all([
    get(joinUrl(url, "/api/v3/qualityprofile"), headers),
    get(joinUrl(url, "/api/v3/rootfolder"), headers),
    kind === "sonarr" ? get(joinUrl(url, "/api/v3/languageprofile"), headers) : Promise.resolve(null),
  ]);
  const p = classify(profiles);
  const f = classify(folders);
  if (p !== "ok") return { ok: false, error: p };
  if (f !== "ok") return { ok: false, error: f };
  let languageProfiles: NamedId[] | null = null;
  if (langs) {
    if (!("error" in langs) && langs.status === 404) languageProfiles = null;
    else {
      const body = okJson(langs);
      languageProfiles = body === undefined ? null : namedIds(body, "id", "name");
    }
  }
  return {
    ok: true,
    data: {
      ready: true,
      qualityProfiles: namedIds(okJson(profiles), "id", "name"),
      rootFolders: rootPaths(okJson(folders)),
      languageProfiles,
    },
  };
}

export async function probeTmdb(
  apiKey: string,
  country: string,
  get: HttpGet = defaultGet,
): Promise<Probe<{ countries: { code: string; name: string }[]; providers: NamedId[] }>> {
  if (!apiKey.trim()) return { ok: true, skipped: true, data: { countries: [], providers: [] } };
  const q = `api_key=${encodeURIComponent(apiKey.trim())}`;
  const config = await get(`${TMDB}/configuration?${q}`, { Accept: "application/json" });
  const c = classify(config);
  if (c !== "ok") return { ok: false, error: c };
  const regions = await get(`${TMDB}/watch/providers/regions?${q}`, { Accept: "application/json" });
  const countries = parseRegions(okJson(regions) ?? { results: [] });
  let providers: NamedId[] = [];
  if (country.length === 2) {
    const region = `watch_region=${encodeURIComponent(country)}`;
    const [movie, tv] = await Promise.all([
      get(`${TMDB}/watch/providers/movie?${q}&${region}`, { Accept: "application/json" }),
      get(`${TMDB}/watch/providers/tv?${q}&${region}`, { Accept: "application/json" }),
    ]);
    const movieBody = okJson(movie);
    const tvBody = okJson(tv);
    if (movieBody !== undefined || tvBody !== undefined) {
      providers = mergeProviders(movieBody ?? { results: [] }, tvBody ?? { results: [] });
    }
  }
  return { ok: true, data: { countries, providers } };
}

export async function probeJellyfin(url: string, apiKey: string, get: HttpGet = defaultGet): Promise<Probe<null>> {
  if (!url.trim() || !apiKey.trim()) return { ok: true, skipped: true, data: null };
  const res = await get(joinUrl(url, "/System/Info"), {
    "X-Emby-Token": apiKey.trim(),
    Accept: "application/json",
  });
  const c = classify(res);
  if (c !== "ok") return { ok: false, error: c };
  return { ok: true, data: null };
}

export async function probeAll(settings: HouseholdSettings, get: HttpGet = defaultGet): Promise<HouseholdLists> {
  const [tmdb, radarr, sonarr, jellyfin] = await Promise.all([
    probeTmdb(settings.tmdbApiKey, settings.country, get),
    probeArr("radarr", settings.radarr.url, settings.radarr.apiKey, get),
    probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey, get),
    probeJellyfin(settings.jellyfin.url, settings.jellyfin.apiKey, get),
  ]);
  return {
    tmdbReady: Boolean(tmdb.ok && !tmdb.skipped),
    countries: tmdb.ok ? tmdb.data.countries : [],
    providers: tmdb.ok ? tmdb.data.providers : [],
    radarr: radarr.ok ? radarr.data : blankArr(),
    sonarr: sonarr.ok ? sonarr.data : blankArr(),
    errors: {
      tmdb: tmdb.ok ? undefined : tmdb.error,
      radarr: radarr.ok ? undefined : radarr.error,
      sonarr: sonarr.ok ? undefined : sonarr.error,
      jellyfin: jellyfin.ok ? undefined : jellyfin.error,
    },
  };
}
