"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { access } from "@/lib/http";
import { getSettings, num, str } from "@/lib/settings";
import { isTitleKind } from "@/lib/tmdb";
import { addTitle, tmdbCoverageLookup } from "@/lib/watchlist";

export async function addWatchlistAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const kindRaw = formData.get("kind");
  const name = str(formData.get("name"));
  if (!tmdbId || !isTitleKind(kindRaw) || !name) redirect("/search");

  const year = num(formData.get("year"));
  const posterPath = str(formData.get("posterPath")) || null;
  const settings = await getSettings(store);
  const result = await addTitle(
    store,
    { tmdbId, kind: kindRaw, name, year, posterPath },
    { coverage: tmdbCoverageLookup(settings) },
  );

  revalidatePath("/");
  revalidatePath("/search");
  if (!result.ok) {
    redirect(`/search?${new URLSearchParams({
      q: str(formData.get("q")),
      tmdb: String(tmdbId),
      kind: kindRaw,
      ...(num(formData.get("person")) ? { person: String(num(formData.get("person"))) } : {}),
      err: result.error,
    })}`);
  }
  redirect("/");
}
