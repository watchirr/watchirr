"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrAcquire, listSeriesSeasons, parseSeasonNumbers } from "@/lib/arr";
import { access } from "@/lib/http";
import { getSettings, num, str } from "@/lib/settings";
import { expandSeasons, parseWatchlistSection, parseWatchlistView, removeSeasons } from "@/lib/watchlist";
import { watchlistHref } from "./watchlist-path";

export async function loadSeriesSeasonsAction(tmdbId: number): Promise<
  | { ok: true; seasons: number[]; monitored: number[]; inLibrary: boolean }
  | { ok: false; error: string }
> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") return { ok: false, error: "missing-defaults" };
  const settings = await getSettings(store);
  return listSeriesSeasons(settings, tmdbId);
}

export async function expandSeasonsAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  if (!tmdbId) redirect("/");
  const seasons = parseSeasonNumbers(formData.getAll("seasons"));
  const settings = await getSettings(store);
  const result = await expandSeasons(store, tmdbId, seasons, {
    acquire: arrAcquire(settings),
  });

  revalidatePath("/");
  if (!result.ok) {
    redirect(`/?${new URLSearchParams({ err: result.error })}`);
  }
  redirect("/");
}

export async function removeSeasonsAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const section = parseWatchlistSection(str(formData.get("section")));
  const view = parseWatchlistView(str(formData.get("view")));
  if (!tmdbId) redirect(watchlistHref({ section, view }));

  const seasons = parseSeasonNumbers(formData.getAll("seasons"));
  const settings = await getSettings(store);
  const result = await removeSeasons(store, tmdbId, seasons, formData.get("keepFiles") !== "1", settings);

  revalidatePath("/");
  if (!result.ok) redirect(watchlistHref({ section, view, err: result.error }));
  redirect(watchlistHref({ section, view }));
}
