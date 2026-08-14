export const locale = "en-US" as const;
export const flag = "🇺🇸";
export const name = "English";

export const messages = {
  navAria: "Primary",
  navWatchlist: "Watchlist",
  navSearch: "Search",
  navSettings: "Settings",
  logOut: "Log out",
  settingsTitle: "Settings",
  languageLabel: "Language",
  tmdbSection: "TMDB",
  radarrSection: "Radarr",
  sonarrSection: "Sonarr",
  jellyfinSection: "Jellyfin",
  apiKeyLabel: "API key",
  countryLabel: "Country",
  paidServicesHint: "Paid Services used for Streaming Coverage (flatrate only).",
  urlLabel: "URL",
  rootFolderLabel: "Default root folder",
  qualityProfileLabel: "Default quality profile",
  languageProfileLabel: "Default language profile",
  chooseOption: "Choose…",
  loadTmdb: "Load countries and services",
  loadRadarr: "Load from Radarr",
  loadSonarr: "Load from Sonarr",
  saveSettings: "Save",
  settingsSaved: "Settings saved.",
  connectUnreachable: "Could not reach {service}.",
  connectUnauthorized: "{service} rejected the API key.",
  connectFailed: "{service} request failed.",
  watchlistEmpty: "No Watchlist Items yet.",
  searchSoon: "Title search is not available yet.",
} as const;

export type Messages = { [K in keyof typeof messages]: string };
