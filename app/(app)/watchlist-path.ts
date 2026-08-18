import type { WatchlistSection, WatchlistView } from "@/lib/watchlist";

export function watchlistHref(opts: {
  section?: WatchlistSection;
  view?: WatchlistView;
  err?: string;
}): string {
  const q = new URLSearchParams();
  if (opts.section && opts.section !== "all") q.set("section", opts.section);
  if (opts.view && opts.view !== "all") q.set("view", opts.view);
  if (opts.err) q.set("err", opts.err);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}
