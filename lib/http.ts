import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_MAX_AGE, type Store, getStore, resolveAccess } from "./auth";

export async function access() {
  const store = await getStore();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return { store, access: await resolveAccess(store, token) };
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
