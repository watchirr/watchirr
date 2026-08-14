import {
  classify,
  defaultGet,
  joinUrl,
  type HttpGet,
  type ProbeError,
} from "./connect.ts";
import type { HouseholdSettings } from "./settings.ts";
import { num, str } from "./settings.ts";
import type { TitleKind } from "./tmdb.ts";

export type JellyfinError = "jellyfin-unreachable" | "jellyfin-unauthorized" | "jellyfin-failed";

export type ProgressedTitle = { tmdbId: number; kind: TitleKind };

export type ProgressResult =
  | { ok: true; progressed: ProgressedTitle[] }
  | { ok: false; error: JellyfinError };

export type ProgressLookup = () => Promise<ProgressResult>;

function asJellyError(status: ProbeError): JellyfinError {
  if (status === "unreachable") return "jellyfin-unreachable";
  if (status === "unauthorized") return "jellyfin-unauthorized";
  return "jellyfin-failed";
}

function jellyHeaders(apiKey: string): Record<string, string> {
  return { "X-Emby-Token": apiKey.trim(), Accept: "application/json" };
}

/** ADR 0004: any progress > 0% (not a 90% bar); Played counts as progress. */
export function hasProgress(userData: unknown): boolean {
  if (!userData || typeof userData !== "object") return false;
  const o = userData as Record<string, unknown>;
  if (o.Played === true) return true;
  const pct = typeof o.PlayedPercentage === "number" ? o.PlayedPercentage : Number(o.PlayedPercentage);
  if (Number.isFinite(pct) && pct > 0) return true;
  const ticks =
    typeof o.PlaybackPositionTicks === "number"
      ? o.PlaybackPositionTicks
      : Number(o.PlaybackPositionTicks);
  return Number.isFinite(ticks) && ticks > 0;
}

function kindFromType(type: unknown): TitleKind | null {
  if (type === "Movie") return "movie";
  if (type === "Series") return "tv";
  return null;
}

export function titleFromJellyItem(row: unknown): ProgressedTitle | null {
  if (!row || typeof row !== "object") return null;
  const o = row as Record<string, unknown>;
  if (!hasProgress(o.UserData)) return null;
  const kind = kindFromType(o.Type);
  if (!kind) return null;
  const providers =
    o.ProviderIds && typeof o.ProviderIds === "object"
      ? (o.ProviderIds as Record<string, unknown>)
      : {};
  const tmdbId = num(providers.Tmdb) ?? num(providers.tmdb);
  return tmdbId ? { tmdbId, kind } : null;
}

function userIds(json: unknown): string[] {
  if (!Array.isArray(json)) return [];
  const out: string[] = [];
  for (const row of json) {
    if (!row || typeof row !== "object") continue;
    const id = str((row as Record<string, unknown>).Id);
    if (id) out.push(id);
  }
  return out;
}

function itemsPayload(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === "object") {
    const items = (json as Record<string, unknown>).Items;
    if (Array.isArray(items)) return items;
  }
  return [];
}

/**
 * Titles any Jellyfin user has played with progress > 0%.
 * ponytail: full Movie+Series scan per user on poll; ceiling = huge libraries → webhook/delta later.
 */
export function jellyfinProgress(
  settings: Pick<HouseholdSettings, "jellyfin">,
  get: HttpGet = defaultGet,
): ProgressLookup {
  return async () => {
    const url = settings.jellyfin.url.trim();
    const apiKey = settings.jellyfin.apiKey.trim();
    if (!url || !apiKey) return { ok: true, progressed: [] };

    const headers = jellyHeaders(apiKey);
    const usersRes = await get(joinUrl(url, "/Users"), headers);
    const usersClass = classify(usersRes);
    if (usersClass !== "ok") return { ok: false, error: asJellyError(usersClass) };

    const progressed: ProgressedTitle[] = [];
    const seen = new Set<string>();

    for (const userId of userIds("json" in usersRes ? usersRes.json : null)) {
      const itemsRes = await get(
        joinUrl(
          url,
          `/Users/${encodeURIComponent(userId)}/Items?Recursive=true&IncludeItemTypes=Movie,Series&Fields=ProviderIds`,
        ),
        headers,
      );
      const itemsClass = classify(itemsRes);
      if (itemsClass !== "ok") return { ok: false, error: asJellyError(itemsClass) };
      for (const row of itemsPayload("json" in itemsRes ? itemsRes.json : null)) {
        const title = titleFromJellyItem(row);
        if (!title) continue;
        const key = `${title.kind}:${title.tmdbId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        progressed.push(title);
      }
    }

    return { ok: true, progressed };
  };
}
