"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrAcquire, listSeriesSeasons, parseSeasonNumbers } from "@/lib/arr";
import { access } from "@/lib/http";
import { getSettings, num } from "@/lib/settings";
import { expandSeasons } from "@/lib/watchlist";

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
