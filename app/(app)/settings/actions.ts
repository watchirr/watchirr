import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listRadarrLibrary, type ArrError } from "@/lib/arr";
import { probeAll, probeArr, probeTmdb, type HouseholdLists } from "@/lib/connect";
import { access } from "@/lib/http";
import { getSettings, putSettings, settingsFromForm, type HouseholdSettings } from "@/lib/settings";
import { importLibraryTitles } from "@/lib/watchlist";

export type RadarrImportFlash =
  | { ok: true; added: number; alreadyOnList: number; skippedNoTmdb: number }
  | { ok: false; error: ArrError };

export type HouseholdState = HouseholdLists & {
  settings: HouseholdSettings;
  saved: boolean;
  stamp: number;
  radarrImport?: RadarrImportFlash;
};

export function householdState(
  settings: HouseholdSettings,
  lists: HouseholdLists,
  saved: boolean,
  radarrImport?: RadarrImportFlash,
): HouseholdState {
  return { settings, ...lists, saved, stamp: Date.now(), radarrImport };
}

export async function loadHousehold(): Promise<HouseholdState> {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const settings = await getSettings(store);
  return householdState(settings, await probeAll(settings), false);
}

export async function householdAction(prev: HouseholdState, formData: FormData): Promise<HouseholdState> {
  "use server";
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const settings = settingsFromForm(formData);
  const intent = String(formData.get("intent") ?? "save");

  if (intent === "probe-tmdb") {
    const tmdb = await probeTmdb(settings.tmdbApiKey, settings.country);
    return householdState(settings, {
      tmdbReady: Boolean(tmdb.ok && !tmdb.skipped),
      countries: tmdb.ok ? tmdb.data.countries : [],
      providers: tmdb.ok ? tmdb.data.providers : [],
      radarr: prev.radarr,
      sonarr: prev.sonarr,
      errors: { ...prev.errors, tmdb: tmdb.ok ? undefined : tmdb.error },
    }, false);
  }

  if (intent === "probe-radarr") {
    const radarr = await probeArr("radarr", settings.radarr.url, settings.radarr.apiKey);
    return householdState(settings, {
      tmdbReady: prev.tmdbReady,
      countries: prev.countries,
      providers: prev.providers,
      radarr: radarr.ok && !radarr.skipped ? radarr.data : { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null },
      sonarr: prev.sonarr,
      errors: { ...prev.errors, radarr: radarr.ok ? undefined : radarr.error },
    }, false);
  }

  if (intent === "probe-sonarr") {
    const sonarr = await probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey);
    return householdState(settings, {
      tmdbReady: prev.tmdbReady,
      countries: prev.countries,
      providers: prev.providers,
      radarr: prev.radarr,
      sonarr: sonarr.ok && !sonarr.skipped ? sonarr.data : { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null },
      errors: { ...prev.errors, sonarr: sonarr.ok ? undefined : sonarr.error },
    }, false);
  }

  if (intent === "import-radarr-library") {
    const lists = {
      tmdbReady: prev.tmdbReady,
      countries: prev.countries,
      providers: prev.providers,
      radarr: prev.radarr,
      sonarr: prev.sonarr,
      errors: prev.errors,
    };
    const listed = await listRadarrLibrary(settings);
    if (!listed.ok) {
      return householdState(settings, lists, false, listed);
    }
    const imported = await importLibraryTitles(store, listed.titles);
    revalidatePath("/");
    revalidatePath("/search");
    return householdState(settings, lists, false, {
      ok: true,
      added: imported.added,
      alreadyOnList: imported.alreadyOnList,
      skippedNoTmdb: listed.skippedNoTmdb,
    });
  }

  await putSettings(store, settings);
  revalidatePath("/", "layout");
  return householdState(settings, await probeAll(settings), true);
}
