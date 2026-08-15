import type { AcquireFn, AcquireOpts, ArrError, DropFn, LibraryLookup } from "./arr.ts";
import type { Store } from "./auth.ts";
import type { ProgressLookup } from "./jellyfin.ts";
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
  inLibrary: boolean;
  watched: boolean;
  addedAt: number;
};

export type WatchlistView = "all" | "covered" | "acquire" | "watched";

export type CoverageLookup = (title: Title) => Promise<CoverageResult>;

export type AddError = SearchError | ArrError;

export type AddResult =
  | { ok: true; item: WatchlistItem; acquired: boolean; existed: boolean }
  | { ok: false; error: AddError };

export type Acquire = AcquireFn;
export type Drop = DropFn;

// ponytail: default ports for tests / covered-only paths.
export const noopAcquire: Acquire = async () => ({ ok: true });
export const noopDrop: Drop = async () => ({ ok: true });
export const neverInLibrary: LibraryLookup = async () => ({ ok: true, inLibrary: false });

export function parseWatchlistView(value: unknown): WatchlistView {
  return value === "covered" || value === "acquire" || value === "watched" ? value : "all";
}

export function filterItems(items: WatchlistItem[], view: WatchlistView): WatchlistItem[] {
  if (view === "covered") return items.filter((i) => !i.shouldAcquire && !i.inLibrary && !i.watched);
  if (view === "acquire") return items.filter((i) => i.shouldAcquire && !i.watched);
  if (view === "watched") return items.filter((i) => i.watched);
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
  const inLibrary = o.inLibrary === true;
  const watched = o.watched === true;
  const uncovered = o.shouldAcquire === true || (o.shouldAcquire !== false && services.length === 0);
  // In Library skips Acquire — never treat as "to queue".
  const shouldAcquire = uncovered && !inLibrary;
  return { title, services, shouldAcquire, inLibrary, watched, addedAt };
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
 * Watchlist application seam: create Item, resolve Streaming Coverage, Acquire or expand seasons.
 * Covered → no Acquire. Uncovered + not In Library → Acquire once.
 * Uncovered + In Library + TV seasons → expand monitored seasons (no double-queue).
 */
export async function addTitle(
  store: Store,
  title: Title,
  deps: {
    coverage: CoverageLookup;
    inLibrary?: LibraryLookup;
    acquire?: Acquire;
  },
  opts?: AcquireOpts,
): Promise<AddResult> {
  const existing = await findItem(store, title.tmdbId, title.kind);
  if (existing) return { ok: true, item: existing, acquired: false, existed: true };

  const cov = await deps.coverage(title);
  if (!cov.ok) return { ok: false, error: cov.error };

  const covered = cov.services.length > 0;
  let inLibrary = false;
  let acquired = false;
  const seasons = opts?.seasons ?? [];

  if (!covered) {
    const lib = await (deps.inLibrary ?? neverInLibrary)(title);
    if (!lib.ok) return { ok: false, error: lib.error };
    inLibrary = lib.inLibrary;
    if (!inLibrary) {
      const acq = await (deps.acquire ?? noopAcquire)(title, opts);
      if (!acq.ok) return { ok: false, error: acq.error };
      acquired = true;
    } else if (title.kind === "tv" && seasons.length > 0) {
      const acq = await (deps.acquire ?? noopAcquire)(title, opts);
      if (!acq.ok) return { ok: false, error: acq.error };
      acquired = true;
    }
  }

  const item: WatchlistItem = {
    title,
    services: cov.services,
    shouldAcquire: !covered && !inLibrary,
    inLibrary,
    watched: false,
    addedAt: Date.now(),
  };
  await saveItem(store, item);
  return { ok: true, item, acquired, existed: false };
}

/**
 * Expand seasons on a Watchlist TV Item already In Library (Sonarr PUT; no Remove).
 */
export async function expandSeasons(
  store: Store,
  tmdbId: number,
  seasons: number[],
  deps: { acquire?: Acquire },
): Promise<AddResult> {
  const existing = await findItem(store, tmdbId, "tv");
  if (!existing) return { ok: false, error: "not-found" };
  if (seasons.length === 0) return { ok: false, error: "missing-seasons" };
  const acq = await (deps.acquire ?? noopAcquire)(existing.title, { seasons });
  if (!acq.ok) return { ok: false, error: acq.error };
  const item = { ...existing, inLibrary: true, shouldAcquire: false };
  await saveItem(store, item);
  return { ok: true, item, acquired: true, existed: true };
}

/**
 * Manual Household Watched. Does not touch *arr / disk (ADR 0014 / glossary).
 */
export async function markWatched(
  store: Store,
  tmdbId: number,
  kind: TitleKind,
): Promise<WatchlistItem | null> {
  const existing = await findItem(store, tmdbId, kind);
  if (!existing) return null;
  if (existing.watched) return existing;
  const item = { ...existing, watched: true };
  await saveItem(store, item);
  return item;
}

/**
 * Poll Jellyfin progress into Household Watched. No *arr delete.
 */
export async function syncJellyfinWatched(
  store: Store,
  deps: { progress: ProgressLookup },
): Promise<{ marked: number }> {
  const result = await deps.progress();
  if (!result.ok) return { marked: 0 };
  if (result.progressed.length === 0) return { marked: 0 };

  const hits = new Set(result.progressed.map((p) => `${p.kind}:${p.tmdbId}`));
  const items = await listItems(store);
  let marked = 0;
  const next = items.map((item) => {
    if (item.watched) return item;
    if (!hits.has(`${item.title.kind}:${item.title.tmdbId}`)) return item;
    marked += 1;
    return { ...item, watched: true };
  });
  if (marked > 0) await putItems(store, next);
  return { marked };
}

/**
 * Admin Remove: drop *arr+files when In Library or was Acquired; Watchirr-only if streaming-only.
 * keepFiles skips the *arr drop so disk copies stay (re-add sees In Library, no re-Acquire).
 * Watched does not call this. Re-add after success is a fresh addTitle.
 */
export async function removeTitle(
  store: Store,
  tmdbId: number,
  kind: TitleKind,
  deps?: { drop?: Drop; keepFiles?: boolean },
): Promise<{ ok: true } | { ok: false; error: ArrError }> {
  const existing = await findItem(store, tmdbId, kind);
  if (!existing) return { ok: true };
  if (!deps?.keepFiles && (existing.inLibrary || existing.shouldAcquire)) {
    const dropped = await (deps?.drop ?? noopDrop)(existing.title);
    if (!dropped.ok) return dropped;
  }
  const items = await listItems(store);
  await putItems(
    store,
    items.filter((i) => !(i.title.tmdbId === tmdbId && i.title.kind === kind)),
  );
  return { ok: true };
}
