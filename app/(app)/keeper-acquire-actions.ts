"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrAcquire, parseSeasonNumbers } from "@/lib/arr";
import { access } from "@/lib/http";
import { getSettings, num, str } from "@/lib/settings";
import { isTitleKind } from "@/lib/tmdb";
import { keeperAcquire } from "@/lib/watchlist";

export async function keeperAcquireAction(formData: FormData): Promise<void> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const tmdbId = num(formData.get("tmdbId"));
  const kindRaw = formData.get("kind");
  if (!tmdbId || !isTitleKind(kindRaw)) redirect("/");

  const settings = await getSettings(store);
  const seasons = parseSeasonNumbers(formData.getAll("seasons"));
  const result = await keeperAcquire(
    store,
    tmdbId,
    kindRaw,
    { acquire: arrAcquire(settings) },
    {
      qualityProfileId: num(formData.get("qualityProfileId")),
      rootFolder: str(formData.get("rootFolder")) || undefined,
      seasons: kindRaw === "tv" ? seasons : undefined,
    },
  );

  revalidatePath("/");
  if (!result.ok) {
    redirect(`/?${new URLSearchParams({ err: result.error })}`);
  }
  redirect("/");
}
