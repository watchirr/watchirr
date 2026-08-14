import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { probeAll, probeArr, probeTmdb, type HouseholdLists } from "@/lib/connect";
import { access } from "@/lib/http";
import { getSettings, putSettings, settingsFromForm, type HouseholdSettings } from "@/lib/settings";

export type HouseholdState = HouseholdLists & {
  settings: HouseholdSettings;
  saved: boolean;
  stamp: number;
};

export function householdState(
  settings: HouseholdSettings,
  lists: HouseholdLists,
  saved: boolean,
): HouseholdState {
  return { settings, ...lists, saved, stamp: Date.now() };
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

  await putSettings(store, settings);
  revalidatePath("/", "layout");
  return householdState(settings, await probeAll(settings), true);
}
