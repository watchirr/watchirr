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
  settingsSoon: "Household Settings are not available yet.",
  watchlistEmpty: "No Watchlist Items yet.",
  searchSoon: "Title search is not available yet.",
} as const;

export type Messages = { [K in keyof typeof messages]: string };
