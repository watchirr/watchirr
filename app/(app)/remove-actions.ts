"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrDrop } from "@/lib/arr";
import { access } from "@/lib/http";
import { getSettings, num, str } from "@/lib/settings";
import { isTitleKind } from "@/lib/tmdb";
import { parseWatchlistSection, parseWatchlistView, removeTitle } from "@/lib/watchlist";
import { watchlistHref } from "./watchlist-path";

export async function removeItemAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const kindRaw = formData.get("kind");
  const section = parseWatchlistSection(str(formData.get("section")));
  const view = parseWatchlistView(str(formData.get("view")));
  if (!tmdbId || !isTitleKind(kindRaw)) redirect("/");

  const settings = await getSettings(store);
  const keepFiles = formData.get("keepFiles") === "1";
  const result = await removeTitle(store, tmdbId, kindRaw, {
    drop: arrDrop(settings),
    keepFiles,
  });
  revalidatePath("/");
  revalidatePath("/search");
  if (!result.ok) redirect(watchlistHref({ section, view, err: result.error }));
  redirect(watchlistHref({ section, view }));
}
