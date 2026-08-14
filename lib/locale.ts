import * as enUS from "./locales/en-US.ts";
import * as ptBR from "./locales/pt-BR.ts";
import type { Messages } from "./locales/en-US.ts";

export type { Messages };

export const LOCALE_META = "locale";

// ponytail: register a catalog here when adding a language; prefix match is first catalog with that language.
export const catalogs = [enUS, ptBR] as const;

export type Locale = (typeof catalogs)[number]["locale"];

export const localeOptions = catalogs.map((c) => ({ locale: c.locale, flag: c.flag, name: c.name }));

export const messages = Object.fromEntries(catalogs.map((c) => [c.locale, c.messages])) as Record<Locale, Messages>;

export function isLocale(value: string | null | undefined): value is Locale {
  return catalogs.some((c) => c.locale === value);
}

export function resolveLocale(saved: string | null | undefined, acceptLanguage: string | null | undefined): Locale {
  if (isLocale(saved)) return saved;
  return fromAcceptLanguage(acceptLanguage) ?? "en-US";
}

function fromAcceptLanguage(header: string | null | undefined): Locale | null {
  if (!header) return null;
  const tags = header
    .split(",")
    .map((part) => {
      const [rawTag, ...params] = part.trim().split(";");
      const tag = rawTag?.trim() ?? "";
      let q = 1;
      for (const p of params) {
        const [k, v] = p.trim().split("=");
        if (k?.trim() === "q") {
          const n = Number(v);
          if (Number.isFinite(n)) q = n;
        }
      }
      return { tag, q };
    })
    .filter((t) => t.tag && t.tag !== "*" && t.q > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of tags) {
    const hit = matchLanguageTag(tag);
    if (hit) return hit;
  }
  return null;
}

function matchLanguageTag(tag: string): Locale | null {
  const normalized = tag.trim().replaceAll("_", "-").toLowerCase();
  const exact = catalogs.find((c) => c.locale.toLowerCase() === normalized);
  if (exact) return exact.locale;
  const lang = normalized.split("-")[0] ?? "";
  const prefix = catalogs.find((c) => {
    const code = c.locale.toLowerCase();
    return code === lang || code.startsWith(`${lang}-`);
  });
  return prefix?.locale ?? null;
}
