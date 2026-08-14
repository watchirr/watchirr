import type { Store } from "./auth.ts";

export const SETTINGS_META = "household";

export type ArrSettings = {
  url: string;
  apiKey: string;
  rootFolder: string;
  qualityProfileId: number | null;
};

export type HouseholdSettings = {
  tmdbApiKey: string;
  country: string;
  paidServiceIds: number[];
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  jellyfin: { url: string; apiKey: string };
};

const emptyArr: ArrSettings = { url: "", apiKey: "", rootFolder: "", qualityProfileId: null };

export const emptySettings: HouseholdSettings = {
  tmdbApiKey: "",
  country: "",
  paidServiceIds: [],
  radarr: { ...emptyArr },
  sonarr: { ...emptyArr, languageProfileId: null },
  jellyfin: { url: "", apiKey: "" },
};

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function uniqueInts(values: unknown[]): number[] {
  const out: number[] = [];
  for (const v of values) {
    const n = num(v);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

function arrFrom(raw: unknown): ArrSettings {
  if (!raw || typeof raw !== "object") return { ...emptyArr };
  const o = raw as Record<string, unknown>;
  return {
    url: str(o.url),
    apiKey: str(o.apiKey),
    rootFolder: str(o.rootFolder),
    qualityProfileId: num(o.qualityProfileId),
  };
}

export function parseSettings(raw: string | null | undefined): HouseholdSettings {
  if (!raw) return structuredClone(emptySettings);
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return structuredClone(emptySettings);
    const o = v as Record<string, unknown>;
    const sonarrRaw = o.sonarr && typeof o.sonarr === "object" ? (o.sonarr as Record<string, unknown>) : {};
    const jelly = o.jellyfin && typeof o.jellyfin === "object" ? (o.jellyfin as Record<string, unknown>) : {};
    return {
      tmdbApiKey: str(o.tmdbApiKey),
      country: str(o.country).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
      paidServiceIds: uniqueInts(Array.isArray(o.paidServiceIds) ? o.paidServiceIds : []),
      radarr: arrFrom(o.radarr),
      sonarr: { ...arrFrom(o.sonarr), languageProfileId: num(sonarrRaw.languageProfileId) },
      jellyfin: { url: str(jelly.url), apiKey: str(jelly.apiKey) },
    };
  } catch {
    return structuredClone(emptySettings);
  }
}

export function serializeSettings(settings: HouseholdSettings): string {
  return JSON.stringify(settings);
}

export function settingsFromForm(formData: FormData): HouseholdSettings {
  return {
    tmdbApiKey: str(formData.get("tmdbApiKey")),
    country: str(formData.get("country")).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2),
    paidServiceIds: uniqueInts(formData.getAll("paidServiceIds")),
    radarr: {
      url: str(formData.get("radarrUrl")),
      apiKey: str(formData.get("radarrApiKey")),
      rootFolder: str(formData.get("radarrRootFolder")),
      qualityProfileId: num(formData.get("radarrQualityProfileId")),
    },
    sonarr: {
      url: str(formData.get("sonarrUrl")),
      apiKey: str(formData.get("sonarrApiKey")),
      rootFolder: str(formData.get("sonarrRootFolder")),
      qualityProfileId: num(formData.get("sonarrQualityProfileId")),
      languageProfileId: num(formData.get("sonarrLanguageProfileId")),
    },
    jellyfin: {
      url: str(formData.get("jellyfinUrl")),
      apiKey: str(formData.get("jellyfinApiKey")),
    },
  };
}

export async function getSettings(store: Store): Promise<HouseholdSettings> {
  return parseSettings(await store.getMeta(SETTINGS_META));
}

export async function putSettings(store: Store, settings: HouseholdSettings): Promise<void> {
  await store.setMeta(SETTINGS_META, serializeSettings(settings));
}
