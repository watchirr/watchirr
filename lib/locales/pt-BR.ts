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
  tmdbSection: "TMDB",
  radarrSection: "Radarr",
  sonarrSection: "Sonarr",
  jellyfinSection: "Jellyfin",
  apiKeyLabel: "Chave da API",
  countryLabel: "País",
  paidServicesHint: "Serviços pagos usados na cobertura de streaming (só assinatura).",
  urlLabel: "URL",
  rootFolderLabel: "Pasta raiz padrão",
  qualityProfileLabel: "Perfil de qualidade padrão",
  languageProfileLabel: "Perfil de idioma padrão",
  chooseOption: "Escolher…",
  loadTmdb: "Carregar países e serviços",
  loadRadarr: "Carregar do Radarr",
  loadSonarr: "Carregar do Sonarr",
  saveSettings: "Salvar",
  settingsSaved: "Configurações salvas.",
  connectUnreachable: "Não foi possível conectar a {service}.",
  connectUnauthorized: "{service} recusou a chave da API.",
  connectFailed: "A conexão com {service} falhou.",
  watchlistEmpty: "A lista ainda está vazia.",
  searchSoon: "A busca de títulos ainda não está disponível.",
} as const satisfies Messages;
