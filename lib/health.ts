import type { Store } from "./auth";

export type HealthBody = {
  status: "ok" | "unhealthy";
  db: "ok" | "fail";
};

/** Liveness: process up + DB readable. Does not probe TMDB / *arr / Jellyfin. */
export async function checkHealth(store: Store): Promise<HealthBody> {
  try {
    await store.getAdmin();
    return { status: "ok", db: "ok" };
  } catch {
    return { status: "unhealthy", db: "fail" };
  }
}

export function healthHttpStatus(body: HealthBody): 200 | 503 {
  return body.status === "ok" ? 200 : 503;
}
