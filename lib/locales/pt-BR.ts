import type { Messages } from "./en-US.ts";

export const locale = "pt-BR" as const;
export const flag = "🇧🇷";
export const name = "Português (Brasil)";

export const messages = {
  navAria: "Navegação principal",
  navWatchlist: "Lista",
  navSearch: "Buscar",
  navSettings: "Configurações",
  logOut: "Sair",
  settingsTitle: "Configurações",
  languageLabel: "Idioma",
  settingsSoon: "As configurações da casa ainda não estão disponíveis.",
  watchlistEmpty: "A lista ainda está vazia.",
  searchSoon: "A busca de títulos ainda não está disponível.",
} as const satisfies Messages;
