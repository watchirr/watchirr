import {
  classify,
  defaultDelete,
  defaultGet,
  defaultPost,
  defaultPut,
  joinUrl,
  TMDB,
  type HttpDelete,
  type HttpGet,
  type HttpPost,
  type HttpPut,
  type HttpResult,
  type ProbeError,
} from "./connect.ts";
import type { ArrSettings, HouseholdSettings } from "./settings.ts";
import { num, str } from "./settings.ts";
import type { Title } from "./tmdb.ts";

export type ArrError =
  | "missing-defaults"
  | "missing-tvdb"
  | "missing-seasons"
  | "not-found"
  | "already-in-library"
  | "uncovered"
  | "arr-unreachable"
  | "arr-unauthorized"
  | "arr-failed";

function asArrError(status: ProbeError): ArrError {
  if (status === "unreachable") return "arr-unreachable";
  if (status === "unauthorized") return "arr-unauthorized";
  return "arr-failed";
}

export type AcquireOpts = {
  qualityProfileId?: number | null;
  rootFolder?: string;
  /** TV only: season numbers to monitor (specials / 0 excluded). */
  seasons?: number[];
};

export type LibraryResult = { ok: true; inLibrary: boolean } | { ok: false; error: ArrError };
export type AcquireResult = { ok: true } | { ok: false; error: ArrError };
export type SeasonsResult =
  | { ok: true; seasons: number[]; monitored: number[]; inLibrary: boolean }
  | { ok: false; error: ArrError };

export type LibraryLookup = (title: Title) => Promise<LibraryResult>;
export type AcquireFn = (title: Title, opts?: AcquireOpts) => Promise<AcquireResult>;
export type DropFn = (title: Title) => Promise<AcquireResult>;

function arrHeaders(apiKey: string): Record<string, string> {
  return { "X-Api-Key": apiKey.trim(), Accept: "application/json" };
}

export function arrReachable(arr: Pick<ArrSettings, "url" | "apiKey">): boolean {
  return Boolean(arr.url.trim() && arr.apiKey.trim());
}

export function movieDefaultsReady(
  radarr: ArrSettings,
  opts?: AcquireOpts,
): { qualityProfileId: number; rootFolder: string } | null {
  const qualityProfileId = num(opts?.qualityProfileId) ?? radarr.qualityProfileId;
  const rootFolder = str(opts?.rootFolder) || radarr.rootFolder;
  if (!arrReachable(radarr) || !qualityProfileId || !rootFolder) return null;
  return { qualityProfileId, rootFolder };
}

export function seriesDefaultsReady(
  sonarr: ArrSettings & { languageProfileId: number | null },
  opts?: AcquireOpts,
): { qualityProfileId: number; rootFolder: string; languageProfileId: number | null } | null {
  const qualityProfileId = num(opts?.qualityProfileId) ?? sonarr.qualityProfileId;
  const rootFolder = str(opts?.rootFolder) || sonarr.rootFolder;
  if (!arrReachable(sonarr) || !qualityProfileId || !rootFolder) return null;
  return { qualityProfileId, rootFolder, languageProfileId: sonarr.languageProfileId };
}

/** Positive season numbers only — Specials (0) stay out of the picker (ADR 0018). */
export function parseSeasonNumbers(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = num(v);
    if (n && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

export function pickerSeasons(hit: Record<string, unknown>): number[] {
  const rows = Array.isArray(hit.seasons) ? hit.seasons : [];
  const out: number[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const n = num((row as { seasonNumber?: unknown }).seasonNumber);
    if (n && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

export function monitoredSeasons(hit: Record<string, unknown>): number[] {
  const rows = Array.isArray(hit.seasons) ? hit.seasons : [];
  const out: number[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const n = num(o.seasonNumber);
    if (n && n > 0 && o.monitored === true && !out.includes(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/** New Acquire: only selected seasons monitored. */
export function withMonitoredSeasons(hit: Record<string, unknown>, selected: number[]): unknown[] {
  const want = new Set(selected);
  const rows = Array.isArray(hit.seasons) ? hit.seasons : [];
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const o = { ...(row as Record<string, unknown>) };
    const n = num(o.seasonNumber) ?? 0;
    o.monitored = want.has(n);
    return o;
  });
}

/** Expand In Library: OR selected onto already-monitored seasons (never turn existing off). */
export function addMonitoredSeasons(hit: Record<string, unknown>, selected: number[]): unknown[] {
  const want = new Set(selected);
  const rows = Array.isArray(hit.seasons) ? hit.seasons : [];
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    const o = { ...(row as Record<string, unknown>) };
    const n = num(o.seasonNumber) ?? 0;
    o.monitored = o.monitored === true || want.has(n);
    return o;
  });
}

/** Lookup payload: Radarr/Sonarr set numeric `id` when the Title is already In Library. */
export function lookupInLibrary(json: unknown): { hit: Record<string, unknown> | null; inLibrary: boolean } {
  const row = Array.isArray(json) ? json[0] : json;
  if (!row || typeof row !== "object") return { hit: null, inLibrary: false };
  const hit = row as Record<string, unknown>;
  return { hit, inLibrary: Boolean(num(hit.id)) };
}

export async function tvdbIdForTmdb(
  apiKey: string,
  tmdbId: number,
  get: HttpGet = defaultGet,
): Promise<{ ok: true; tvdbId: number } | { ok: false; error: ArrError }> {
  if (!apiKey.trim()) return { ok: false, error: "missing-defaults" };
  const url = `${TMDB}/tv/${tmdbId}/external_ids?${new URLSearchParams({ api_key: apiKey.trim() })}`;
  const res = await get(url, { Accept: "application/json" });
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: asArrError(status) };
  const tvdbId = "error" in res ? null : num((res.json as { tvdb_id?: unknown } | null)?.tvdb_id);
  if (!tvdbId) return { ok: false, error: "missing-tvdb" };
  return { ok: true, tvdbId };
}

async function radarrLookup(
  url: string,
  apiKey: string,
  tmdbId: number,
  get: HttpGet,
): Promise<{ ok: true; hit: Record<string, unknown>; inLibrary: boolean } | { ok: false; error: ArrError }> {
  const res = await get(
    joinUrl(url, `/api/v3/movie/lookup?term=${encodeURIComponent(`tmdb:${tmdbId}`)}`),
    arrHeaders(apiKey),
  );
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: asArrError(status) };
  const { hit, inLibrary } = lookupInLibrary("error" in res ? null : res.json);
  if (!hit) return { ok: false, error: "not-found" };
  return { ok: true, hit, inLibrary };
}

async function sonarrLookup(
  url: string,
  apiKey: string,
  tvdbId: number,
  get: HttpGet,
): Promise<{ ok: true; hit: Record<string, unknown>; inLibrary: boolean } | { ok: false; error: ArrError }> {
  const res = await get(
    joinUrl(url, `/api/v3/series/lookup?term=${encodeURIComponent(`tvdb:${tvdbId}`)}`),
    arrHeaders(apiKey),
  );
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: asArrError(status) };
  const { hit, inLibrary } = lookupInLibrary("error" in res ? null : res.json);
  if (!hit) return { ok: false, error: "not-found" };
  return { ok: true, hit, inLibrary };
}

async function sonarrSeriesById(
  url: string,
  apiKey: string,
  id: number,
  get: HttpGet,
): Promise<{ ok: true; hit: Record<string, unknown> } | { ok: false; error: ArrError }> {
  const res = await get(joinUrl(url, `/api/v3/series/${id}`), arrHeaders(apiKey));
  const status = classify(res);
  if (status !== "ok") return { ok: false, error: asArrError(status) };
  if ("error" in res || !res.json || typeof res.json !== "object") return { ok: false, error: "not-found" };
  return { ok: true, hit: res.json as Record<string, unknown> };
}

export function arrLibraryLookup(
  settings: HouseholdSettings,
  get: HttpGet = defaultGet,
): LibraryLookup {
  return async (title) => {
    if (title.kind === "movie") {
      if (!arrReachable(settings.radarr)) return { ok: false, error: "missing-defaults" };
      const looked = await radarrLookup(settings.radarr.url, settings.radarr.apiKey, title.tmdbId, get);
      if (!looked.ok) return looked;
      return { ok: true, inLibrary: looked.inLibrary };
    }
    if (!arrReachable(settings.sonarr)) return { ok: false, error: "missing-defaults" };
    const tvdb = await tvdbIdForTmdb(settings.tmdbApiKey, title.tmdbId, get);
    if (!tvdb.ok) return tvdb;
    const looked = await sonarrLookup(settings.sonarr.url, settings.sonarr.apiKey, tvdb.tvdbId, get);
    if (!looked.ok) return looked;
    return { ok: true, inLibrary: looked.inLibrary };
  };
}

/** Season numbers for the add/expand UI (Sonarr; no specials). */
export async function listSeriesSeasons(
  settings: HouseholdSettings,
  tmdbId: number,
  get: HttpGet = defaultGet,
): Promise<SeasonsResult> {
  if (!arrReachable(settings.sonarr)) return { ok: false, error: "missing-defaults" };
  const tvdb = await tvdbIdForTmdb(settings.tmdbApiKey, tmdbId, get);
  if (!tvdb.ok) return tvdb;
  const looked = await sonarrLookup(settings.sonarr.url, settings.sonarr.apiKey, tvdb.tvdbId, get);
  if (!looked.ok) return looked;
  let hit = looked.hit;
  if (looked.inLibrary) {
    const id = num(hit.id);
    if (!id) return { ok: false, error: "not-found" };
    const series = await sonarrSeriesById(settings.sonarr.url, settings.sonarr.apiKey, id, get);
    if (!series.ok) return series;
    hit = series.hit;
  }
  return {
    ok: true,
    seasons: pickerSeasons(hit),
    monitored: monitoredSeasons(hit),
    inLibrary: looked.inLibrary,
  };
}

async function expandInLibrarySeries(
  settings: HouseholdSettings,
  seriesId: number,
  seasons: number[],
  get: HttpGet,
  post: HttpPost,
  put: HttpPut,
): Promise<AcquireResult> {
  const series = await sonarrSeriesById(settings.sonarr.url, settings.sonarr.apiKey, seriesId, get);
  if (!series.ok) return series;
  const body = {
    ...series.hit,
    seasons: addMonitoredSeasons(series.hit, seasons),
  };
  const putRes = await put(
    joinUrl(settings.sonarr.url, `/api/v3/series/${seriesId}`),
    arrHeaders(settings.sonarr.apiKey),
    body,
  );
  const putStatus = classify(putRes);
  if (putStatus !== "ok") return { ok: false, error: asArrError(putStatus) };
  const cmd = await post(
    joinUrl(settings.sonarr.url, "/api/v3/command"),
    arrHeaders(settings.sonarr.apiKey),
    { name: "SeriesSearch", seriesId },
  );
  const cmdStatus = classify(cmd);
  return cmdStatus === "ok" ? { ok: true } : { ok: false, error: asArrError(cmdStatus) };
}

export function arrAcquire(
  settings: HouseholdSettings,
  get: HttpGet = defaultGet,
  post: HttpPost = defaultPost,
  put: HttpPut = defaultPut,
): AcquireFn {
  return async (title, opts) => {
    if (title.kind === "movie") {
      const ready = movieDefaultsReady(settings.radarr, opts);
      if (!ready) return { ok: false, error: "missing-defaults" };
      const looked = await radarrLookup(settings.radarr.url, settings.radarr.apiKey, title.tmdbId, get);
      if (!looked.ok) return looked;
      if (looked.inLibrary) return { ok: true };
      const body = {
        ...looked.hit,
        qualityProfileId: ready.qualityProfileId,
        rootFolderPath: ready.rootFolder,
        monitored: true,
        // ponytail: Radarr requires a MovieStatusType; Settings override later if Household wants announced/inCinemas.
        minimumAvailability: "released",
        addOptions: { searchForMovie: true },
      };
      const res = await post(joinUrl(settings.radarr.url, "/api/v3/movie"), arrHeaders(settings.radarr.apiKey), body);
      const status = classify(res);
      return status === "ok" ? { ok: true } : { ok: false, error: asArrError(status) };
    }

    const seasons = parseSeasonNumbers(opts?.seasons ?? []);
    if (seasons.length === 0) return { ok: false, error: "missing-seasons" };
    if (!arrReachable(settings.sonarr)) return { ok: false, error: "missing-defaults" };

    const tvdb = await tvdbIdForTmdb(settings.tmdbApiKey, title.tmdbId, get);
    if (!tvdb.ok) return tvdb;
    const looked = await sonarrLookup(settings.sonarr.url, settings.sonarr.apiKey, tvdb.tvdbId, get);
    if (!looked.ok) return looked;

    if (looked.inLibrary) {
      const seriesId = num(looked.hit.id);
      if (!seriesId) return { ok: false, error: "not-found" };
      return expandInLibrarySeries(settings, seriesId, seasons, get, post, put);
    }

    const ready = seriesDefaultsReady(settings.sonarr, opts);
    if (!ready) return { ok: false, error: "missing-defaults" };
    const body: Record<string, unknown> = {
      ...looked.hit,
      seasons: withMonitoredSeasons(looked.hit, seasons),
      qualityProfileId: ready.qualityProfileId,
      rootFolderPath: ready.rootFolder,
      monitored: true,
      seasonFolder: true,
      addOptions: { searchForMissingEpisodes: true },
    };
    if (ready.languageProfileId) body.languageProfileId = ready.languageProfileId;
    const res = await post(joinUrl(settings.sonarr.url, "/api/v3/series"), arrHeaders(settings.sonarr.apiKey), body);
    const status = classify(res);
    return status === "ok" ? { ok: true } : { ok: false, error: asArrError(status) };
  };
}

function dropResult(res: HttpResult): AcquireResult {
  const status = classify(res);
  if (status === "ok" || (!("error" in res) && res.status === 404)) return { ok: true };
  return { ok: false, error: asArrError(status) };
}

/** Admin Remove: drop from *arr and delete files. Missing / already-gone is success so Watchirr can clear. */
export function arrDrop(
  settings: HouseholdSettings,
  get: HttpGet = defaultGet,
  del: HttpDelete = defaultDelete,
): DropFn {
  return async (title) => {
    if (title.kind === "movie") {
      if (!arrReachable(settings.radarr)) return { ok: false, error: "missing-defaults" };
      const looked = await radarrLookup(settings.radarr.url, settings.radarr.apiKey, title.tmdbId, get);
      if (!looked.ok) return looked.error === "not-found" ? { ok: true } : looked;
      const id = num(looked.hit.id);
      if (!looked.inLibrary || !id) return { ok: true };
      const res = await del(
        joinUrl(
          settings.radarr.url,
          `/api/v3/movie/${id}?deleteFiles=true&addImportExclusion=false`,
        ),
        arrHeaders(settings.radarr.apiKey),
      );
      return dropResult(res);
    }

    if (!arrReachable(settings.sonarr)) return { ok: false, error: "missing-defaults" };
    const tvdb = await tvdbIdForTmdb(settings.tmdbApiKey, title.tmdbId, get);
    if (!tvdb.ok) return tvdb;
    const looked = await sonarrLookup(settings.sonarr.url, settings.sonarr.apiKey, tvdb.tvdbId, get);
    if (!looked.ok) return looked.error === "not-found" ? { ok: true } : looked;
    const id = num(looked.hit.id);
    if (!looked.inLibrary || !id) return { ok: true };
    const res = await del(
      joinUrl(
        settings.sonarr.url,
        `/api/v3/series/${id}?deleteFiles=true&addImportListExclusion=false`,
      ),
      arrHeaders(settings.sonarr.apiKey),
    );
    return dropResult(res);
  };
}
