"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrDrop } from "@/lib/arr";
import { access } from "@/lib/http";
import { getSettings, num, str } from "@/lib/settings";
import { isTitleKind } from "@/lib/tmdb";
import { removeTitle } from "@/lib/watchlist";

function watchlistPath(view: string, err?: string): string {
  const q = new URLSearchParams();
  if (view === "watched" || view === "covered" || view === "acquire") q.set("view", view);
  if (err) q.set("err", err);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export async function removeItemAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const kindRaw = formData.get("kind");
  const view = str(formData.get("view"));
  if (!tmdbId || !isTitleKind(kindRaw)) redirect("/");

  const settings = await getSettings(store);
  const keepFiles = formData.get("keepFiles") === "1";
  const result = await removeTitle(store, tmdbId, kindRaw, {
    drop: arrDrop(settings),
    keepFiles,
  });
  revalidatePath("/");
  revalidatePath("/search");
  if (!result.ok) redirect(watchlistPath(view, result.error));
  redirect(watchlistPath(view));
}
