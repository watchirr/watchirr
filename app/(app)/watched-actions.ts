"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { access } from "@/lib/http";
import { num, str } from "@/lib/settings";
import { isTitleKind } from "@/lib/tmdb";
import { parseWatchlistSection, parseWatchlistView, markWatched } from "@/lib/watchlist";
import { watchlistHref } from "./watchlist-path";

export async function markWatchedAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const kindRaw = formData.get("kind");
  if (!tmdbId || !isTitleKind(kindRaw)) redirect("/");

  await markWatched(store, tmdbId, kindRaw);
  revalidatePath("/");
  const section = parseWatchlistSection(str(formData.get("section")));
  const view = parseWatchlistView(str(formData.get("view")));
  redirect(watchlistHref({ section, view }));
}
