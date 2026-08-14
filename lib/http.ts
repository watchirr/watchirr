import { cookies, headers } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, type Store, getStore, resolveAccess } from "./auth";
import { LOCALE_META, resolveLocale, type Locale } from "./locale";
import { KIND_META, parseKindFilter, type KindFilter } from "./tmdb";

export async function access() {
  const store = await getStore();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return { store, access: await resolveAccess(store, token) };
}

export async function currentLocale(): Promise<Locale> {
  const store = await getStore();
  return resolveLocale(await store.getMeta(LOCALE_META), (await headers()).get("accept-language"));
}

export async function currentTitleKind(): Promise<KindFilter> {
  const store = await getStore();
  return parseKindFilter(await store.getMeta(KIND_META));
}

export async function setSessionCookie(store: Store, token: string) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
