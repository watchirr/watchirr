import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listRadarrLibrary, listSonarrLibrary, type ArrError } from "@/lib/arr";
import { probeAll, probeArr, probeTmdb, type HouseholdLists } from "@/lib/connect";
import { access, currentLocale } from "@/lib/http";
import { jellyfinProgress, type JellyfinError } from "@/lib/jellyfin";
import { getSettings, putSettings, settingsFromForm, type HouseholdSettings } from "@/lib/settings";
import { withTmdbPosters } from "@/lib/tmdb";
import { importLibraryTitles, syncJellyfinWatched } from "@/lib/watchlist";

export type LibraryImportFlash =
  | { ok: true; added: number; alreadyOnList: number; skippedNoTmdb: number }
  | { ok: false; error: ArrError };

export type WatchedImportFlash =
  | { ok: true; marked: number; alreadyWatched: number; noMatch: number }
  | { ok: false; error: JellyfinError | "missing-defaults" };

export type HouseholdState = HouseholdLists & {
  settings: HouseholdSettings;
  saved: boolean;
  stamp: number;
  /** Which integration Load button produced this state (toast seam). */
  probed?: "tmdb" | "radarr" | "sonarr";
  radarrImport?: LibraryImportFlash;
  sonarrImport?: LibraryImportFlash;
  jellyfinImport?: WatchedImportFlash;
};

export function householdState(
  settings: HouseholdSettings,
  lists: HouseholdLists,
  saved: boolean,
  flash?: {
    radarrImport?: LibraryImportFlash;
    sonarrImport?: LibraryImportFlash;
    jellyfinImport?: WatchedImportFlash;
    probed?: "tmdb" | "radarr" | "sonarr";
  },
): HouseholdState {
  return {
    settings,
    ...lists,
    saved,
    stamp: Date.now(),
    probed: flash?.probed,
    radarrImport: flash?.radarrImport,
    sonarrImport: flash?.sonarrImport,
    jellyfinImport: flash?.jellyfinImport,
  };
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
    return householdState(
      settings,
      {
        tmdbReady: Boolean(tmdb.ok && !tmdb.skipped),
        countries: tmdb.ok ? tmdb.data.countries : [],
        providers: tmdb.ok ? tmdb.data.providers : [],
        radarr: prev.radarr,
        sonarr: prev.sonarr,
        errors: { ...prev.errors, tmdb: tmdb.ok ? undefined : tmdb.error },
      },
      false,
      { probed: "tmdb" },
    );
  }

  if (intent === "probe-radarr") {
    const radarr = await probeArr("radarr", settings.radarr.url, settings.radarr.apiKey);
    return householdState(
      settings,
      {
        tmdbReady: prev.tmdbReady,
        countries: prev.countries,
        providers: prev.providers,
        radarr: radarr.ok && !radarr.skipped ? radarr.data : { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null },
        sonarr: prev.sonarr,
        errors: { ...prev.errors, radarr: radarr.ok ? undefined : radarr.error },
      },
      false,
      { probed: "radarr" },
    );
  }

  if (intent === "probe-sonarr") {
    const sonarr = await probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey);
    return householdState(
      settings,
      {
        tmdbReady: prev.tmdbReady,
        countries: prev.countries,
        providers: prev.providers,
        radarr: prev.radarr,
        sonarr: sonarr.ok && !sonarr.skipped ? sonarr.data : { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null },
        errors: { ...prev.errors, sonarr: sonarr.ok ? undefined : sonarr.error },
      },
      false,
      { probed: "sonarr" },
    );
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
    try {
      const listed = await listRadarrLibrary(settings);
      if (!listed.ok) {
        return householdState(settings, lists, false, { radarrImport: listed });
      }
      const locale = await currentLocale();
      const titles = await withTmdbPosters(settings.tmdbApiKey, listed.titles, locale);
      const imported = await importLibraryTitles(store, titles);
      // ponytail: do not revalidatePath("/") here — prod would re-render the whole Watchlist
      // (OMDb/Jellyfin) into this POST; proxy kills it after the import already saved.
      return householdState(settings, lists, false, {
        radarrImport: {
          ok: true,
          added: imported.added,
          alreadyOnList: imported.alreadyOnList,
          skippedNoTmdb: listed.skippedNoTmdb,
        },
      });
    } catch {
      return householdState(settings, lists, false, { radarrImport: { ok: false, error: "arr-failed" } });
    }
  }

  if (intent === "import-sonarr-library") {
    const lists = {
      tmdbReady: prev.tmdbReady,
      countries: prev.countries,
      providers: prev.providers,
      radarr: prev.radarr,
      sonarr: prev.sonarr,
      errors: prev.errors,
    };
    try {
      const listed = await listSonarrLibrary(settings);
      if (!listed.ok) {
        return householdState(settings, lists, false, { sonarrImport: listed });
      }
      const locale = await currentLocale();
      const titles = await withTmdbPosters(settings.tmdbApiKey, listed.titles, locale);
      const imported = await importLibraryTitles(store, titles);
      return householdState(settings, lists, false, {
        sonarrImport: {
          ok: true,
          added: imported.added,
          alreadyOnList: imported.alreadyOnList,
          skippedNoTmdb: listed.skippedNoTmdb,
        },
      });
    } catch {
      return householdState(settings, lists, false, { sonarrImport: { ok: false, error: "arr-failed" } });
    }
  }

  if (intent === "import-jellyfin-watched") {
    const lists = {
      tmdbReady: prev.tmdbReady,
      countries: prev.countries,
      providers: prev.providers,
      radarr: prev.radarr,
      sonarr: prev.sonarr,
      errors: prev.errors,
    };
    try {
      if (!settings.jellyfin.url.trim() || !settings.jellyfin.apiKey.trim()) {
        return householdState(settings, lists, false, {
          jellyfinImport: { ok: false, error: "missing-defaults" },
        });
      }
      const synced = await syncJellyfinWatched(store, {
        progress: jellyfinProgress(settings),
      });
      if (!synced.ok) {
        return householdState(settings, lists, false, { jellyfinImport: synced });
      }
      return householdState(settings, lists, false, {
        jellyfinImport: {
          ok: true,
          marked: synced.marked,
          alreadyWatched: synced.alreadyWatched,
          noMatch: synced.noMatch,
        },
      });
    } catch {
      return householdState(settings, lists, false, {
        jellyfinImport: { ok: false, error: "jellyfin-failed" },
      });
    }
  }

  await putSettings(store, settings);
  revalidatePath("/", "layout");
  return householdState(settings, await probeAll(settings), true);
}
