"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { arrAcquire, arrLibraryLookup, parseSeasonNumbers } from "@/lib/arr";
import { access } from "@/lib/http";
import {
  absentRatings,
  getRatingsCache,
  ratingsDepsFromStore,
  resolvePublicRatings,
  type PublicRatings,
} from "@/lib/ratings";
import { isDiscoverRailId } from "@/lib/discover";
import { getSettings, num, str } from "@/lib/settings";
import { isTitleKind, titleCoverage } from "@/lib/tmdb";
import { addTitle, tmdbCoverageLookup } from "@/lib/watchlist";

const heroFallback = { ratings: absentRatings, coverage: { ok: false } as const };

export async function loadSearchHeroAction(
  tmdbId: number,
  kind: string,
): Promise<{
  ratings: PublicRatings;
  coverage: { ok: true; services: { id: number; name: string }[] } | { ok: false };
}> {
  if (!tmdbId || !isTitleKind(kind)) return heroFallback;
  const { store, access: gate } = await access();
  if (gate.status !== "app") return heroFallback;
  const settings = await getSettings(store);
  const cache = await getRatingsCache(store);
  const [ratings, coverage] = await Promise.all([
    resolvePublicRatings({ tmdbId, kind }, ratingsDepsFromStore(store, settings, cache)),
    titleCoverage(settings.tmdbApiKey, { tmdbId, kind }, settings.country, settings.paidServiceIds),
  ]);
  return {
    ratings,
    coverage: coverage.ok ? { ok: true, services: coverage.services } : { ok: false },
  };
}

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
  const seasons = parseSeasonNumbers(formData.getAll("seasons"));
  const result = await addTitle(
    store,
    { tmdbId, kind: kindRaw, name, year, posterPath },
    {
      coverage: tmdbCoverageLookup(settings),
      inLibrary: arrLibraryLookup(settings),
      acquire: arrAcquire(settings),
    },
    {
      qualityProfileId: num(formData.get("qualityProfileId")),
      rootFolder: str(formData.get("rootFolder")) || undefined,
      seasons: kindRaw === "tv" ? seasons : undefined,
    },
  );

  revalidatePath("/");
  revalidatePath("/search");
  if (!result.ok) {
    const err = new URLSearchParams({ tmdb: String(tmdbId), kind: kindRaw, err: result.error });
    const rail = str(formData.get("rail"));
    if (isDiscoverRailId(rail)) {
      const page = num(formData.get("page")) ?? 1;
      if (page > 1) err.set("page", String(page));
      redirect(`/search/${rail}?${err}`);
    }
    err.set("q", str(formData.get("q")));
    const person = num(formData.get("person"));
    if (person) err.set("person", String(person));
    redirect(`/search?${err}`);
  }
  redirect("/");
}
