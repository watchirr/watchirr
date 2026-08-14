import type { Store } from "./auth.ts";
import type { HouseholdSettings } from "./settings.ts";
import { num, str } from "./settings.ts";
import {
  isTitleKind,
  titleCoverage,
  type CoverageResult,
  type SearchError,
  type Title,
  type TitleKind,
} from "./tmdb.ts";

export const WATCHLIST_META = "watchlist";

export type PaidHit = { id: number; name: string };

export type WatchlistItem = {
  title: Title;
  services: PaidHit[];
  shouldAcquire: boolean;
  addedAt: number;
};

export type WatchlistView = "all" | "covered" | "acquire";

export type Acquire = (title: Title) => Promise<void>;

export type CoverageLookup = (title: Title) => Promise<CoverageResult>;

export type AddResult =
  | { ok: true; item: WatchlistItem; acquired: boolean; existed: boolean }
  | { ok: false; error: SearchError };

// ponytail: Acquire is a port; production no-op until ticket 06 wires Radarr/Sonarr.
export const noopAcquire: Acquire = async () => {};

export function parseWatchlistView(value: unknown): WatchlistView {
  return value === "covered" || value === "acquire" ? value : "all";
}

export function filterItems(items: WatchlistItem[], view: WatchlistView): WatchlistItem[] {
  if (view === "covered") return items.filter((i) => !i.shouldAcquire);
  if (view === "acquire") return items.filter((i) => i.shouldAcquire);
  return items;
}

function paidHit(raw: unknown): PaidHit | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = num(o.id);
  const name = str(o.name);
  return id && name ? { id, name } : null;
}

function titleFrom(raw: unknown): Title | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const tmdbId = num(o.tmdbId);
  const kind = o.kind;
  const name = str(o.name);
  if (!tmdbId || !isTitleKind(kind) || !name) return null;
  const yearRaw = o.year;
  const year =
    typeof yearRaw === "number" && Number.isInteger(yearRaw) && yearRaw > 0
      ? yearRaw
      : num(yearRaw);
  return {
    tmdbId,
    kind,
    name,
    year: year && year >= 1000 ? year : null,
    posterPath: str(o.posterPath) || null,
  };
}

function itemFrom(raw: unknown): WatchlistItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const title = titleFrom(o.title);
  if (!title) return null;
  const services = Array.isArray(o.services)
    ? o.services.map(paidHit).filter((s): s is PaidHit => Boolean(s))
    : [];
  const addedAt =
    typeof o.addedAt === "number" && Number.isFinite(o.addedAt) ? o.addedAt : Date.now();
  const shouldAcquire = o.shouldAcquire === true || (o.shouldAcquire !== false && services.length === 0);
  return { title, services, shouldAcquire, addedAt };
}

export function parseItems(raw: string | null | undefined): WatchlistItem[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: WatchlistItem[] = [];
    const seen = new Set<string>();
    for (const row of v) {
      const item = itemFrom(row);
      if (!item) continue;
      const key = `${item.title.kind}:${item.title.tmdbId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  } catch {
    return [];
  }
}

export function serializeItems(items: WatchlistItem[]): string {
  return JSON.stringify(items);
}

export async function listItems(store: Store): Promise<WatchlistItem[]> {
  const items = parseItems(await store.getMeta(WATCHLIST_META));
  return items.sort((a, b) => b.addedAt - a.addedAt);
}

export async function findItem(
  store: Store,
  tmdbId: number,
  kind: TitleKind,
): Promise<WatchlistItem | null> {
  return (await listItems(store)).find((i) => i.title.tmdbId === tmdbId && i.title.kind === kind) ?? null;
}

async function putItems(store: Store, items: WatchlistItem[]): Promise<void> {
  await store.setMeta(WATCHLIST_META, serializeItems(items));
}

export async function saveItem(store: Store, item: WatchlistItem): Promise<void> {
  const items = await listItems(store);
  const next = items.filter(
    (i) => !(i.title.tmdbId === item.title.tmdbId && i.title.kind === item.title.kind),
  );
  next.push(item);
  await putItems(store, next);
}

export function tmdbCoverageLookup(
  settings: Pick<HouseholdSettings, "tmdbApiKey" | "country" | "paidServiceIds">,
  get?: Parameters<typeof titleCoverage>[4],
): CoverageLookup {
  return (title) =>
    titleCoverage(settings.tmdbApiKey, title, settings.country, settings.paidServiceIds, get);
}

/**
 * Watchlist application seam: create Item, resolve Streaming Coverage, decide Acquire.
 * Covered (flatrate ∩ Paid Services) → no Acquire. Uncovered → shouldAcquire + call acquire port.
 */
export async function addTitle(
  store: Store,
  title: Title,
  deps: {
    coverage: CoverageLookup;
    acquire?: Acquire;
  },
): Promise<AddResult> {
  const existing = await findItem(store, title.tmdbId, title.kind);
  if (existing) return { ok: true, item: existing, acquired: false, existed: true };

  const cov = await deps.coverage(title);
  if (!cov.ok) return { ok: false, error: cov.error };

  const shouldAcquire = cov.services.length === 0;
  if (shouldAcquire) await (deps.acquire ?? noopAcquire)(title);

  const item: WatchlistItem = {
    title,
    services: cov.services,
    shouldAcquire,
    addedAt: Date.now(),
  };
  await saveItem(store, item);
  return { ok: true, item, acquired: shouldAcquire, existed: false };
}
