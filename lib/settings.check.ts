import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { openStore } from "./auth.ts";
import {
  type HttpGet,
  type HttpResult,
  joinUrl,
  mergeProviders,
  parseRegions,
  probeAll,
  probeArr,
  probeJellyfin,
  probeTmdb,
} from "./connect.ts";
import {
  emptySettings,
  getSettings,
  parseSettings,
  putSettings,
  serializeSettings,
  settingsFromForm,
} from "./settings.ts";

const dir = mkdtempSync(join(tmpdir(), "watchirr-settings-"));
const store = await openStore({ DATA_DIR: dir });

after(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("parseSettings fills defaults; roundtrip keeps Admin picks", () => {
  assert.deepEqual(parseSettings(null), emptySettings);
  assert.deepEqual(parseSettings("nope"), emptySettings);
  assert.deepEqual(parseSettings("{}").paidServiceIds, []);

  const saved = parseSettings(
    JSON.stringify({
      tmdbApiKey: "  k  ",
      country: "br",
      paidServiceIds: [8, "9", 8, 0, "x"],
      radarr: { url: "http://radarr:7878/", apiKey: "r", rootFolder: "/movies", qualityProfileId: 4 },
      sonarr: {
        url: "http://sonarr:8989",
        apiKey: "s",
        rootFolder: "/tv",
        qualityProfileId: 6,
        languageProfileId: 1,
      },
      jellyfin: { url: "http://jf:8096", apiKey: "j" },
    }),
  );
  assert.equal(saved.tmdbApiKey, "k");
  assert.equal(saved.country, "BR");
  assert.deepEqual(saved.paidServiceIds, [8, 9]);
  assert.equal(saved.radarr.qualityProfileId, 4);
  assert.equal(saved.sonarr.languageProfileId, 1);
  assert.deepEqual(parseSettings(serializeSettings(saved)), saved);
});

test("settings persist on the store and reload", async () => {
  const first = parseSettings(JSON.stringify({ tmdbApiKey: "abc", country: "US", paidServiceIds: [8] }));
  await putSettings(store, first);
  const loaded = await getSettings(store);
  assert.equal(loaded.tmdbApiKey, "abc");
  assert.equal(loaded.country, "US");
  assert.deepEqual(loaded.paidServiceIds, [8]);
});

test("settingsFromForm reads Paid Services multi-select and *arr defaults", () => {
  const form = new FormData();
  form.set("tmdbApiKey", "k");
  form.set("country", "us");
  form.append("paidServiceIds", "8");
  form.append("paidServiceIds", "9");
  form.set("radarrUrl", "http://radarr:7878");
  form.set("radarrApiKey", "rk");
  form.set("radarrRootFolder", "/movies");
  form.set("radarrQualityProfileId", "4");
  form.set("sonarrUrl", "http://sonarr:8989");
  form.set("sonarrApiKey", "sk");
  form.set("sonarrRootFolder", "/tv");
  form.set("sonarrQualityProfileId", "2");
  form.set("sonarrLanguageProfileId", "1");
  form.set("jellyfinUrl", "http://jf:8096");
  form.set("jellyfinApiKey", "jk");
  const s = settingsFromForm(form);
  assert.equal(s.country, "US");
  assert.deepEqual(s.paidServiceIds, [8, 9]);
  assert.equal(s.radarr.qualityProfileId, 4);
  assert.equal(s.sonarr.languageProfileId, 1);
});

test("joinUrl strips trailing slash; TMDB regions/providers parse live-shaped JSON", () => {
  assert.equal(joinUrl("http://radarr:7878/", "/api/v3/qualityprofile"), "http://radarr:7878/api/v3/qualityprofile");
  const regions = parseRegions({
    results: [
      { iso_3166_1: "US", english_name: "United States", native_name: "United States" },
      { iso_3166_1: "BR", english_name: "Brazil", native_name: "Brasil" },
    ],
  });
  assert.deepEqual(
    regions.map((r) => r.code),
    ["BR", "US"],
  );
  const providers = mergeProviders(
    { results: [{ provider_id: 8, provider_name: "Netflix" }] },
    { results: [{ provider_id: 8, provider_name: "Netflix" }, { provider_id: 337, provider_name: "Disney Plus" }] },
  );
  assert.deepEqual(providers, [
    { id: 337, name: "Disney Plus" },
    { id: 8, name: "Netflix" },
  ]);
});

function fake(routes: Record<string, HttpResult>): HttpGet {
  return async (url) => {
    const hit = Object.entries(routes).find(([part]) => url.includes(part));
    return hit?.[1] ?? { error: "unreachable" };
  };
}

test("Radarr/Sonarr lists come from the instance; language profile is optional", async () => {
  const radarr = await probeArr(
    "radarr",
    "http://radarr:7878",
    "rk",
    fake({
      "/api/v3/qualityprofile": { status: 200, json: [{ id: 4, name: "HD-1080p" }] },
      "/api/v3/rootfolder": { status: 200, json: [{ path: "/movies" }] },
    }),
  );
  assert.equal(radarr.ok, true);
  if (radarr.ok) {
    assert.equal(radarr.data.ready, true);
    assert.deepEqual(radarr.data.qualityProfiles, [{ id: 4, name: "HD-1080p" }]);
    assert.deepEqual(radarr.data.rootFolders, [{ path: "/movies" }]);
    assert.equal(radarr.data.languageProfiles, null);
  }

  const sonarrV4 = await probeArr(
    "sonarr",
    "http://sonarr:8989",
    "sk",
    fake({
      "/api/v3/qualityprofile": { status: 200, json: [{ id: 1, name: "Any" }] },
      "/api/v3/rootfolder": { status: 200, json: [{ path: "/tv" }] },
      "/api/v3/languageprofile": { status: 404, json: null },
    }),
  );
  assert.equal(sonarrV4.ok, true);
  if (sonarrV4.ok) assert.equal(sonarrV4.data.languageProfiles, null);

  const sonarrV3 = await probeArr(
    "sonarr",
    "http://sonarr:8989",
    "sk",
    fake({
      "/api/v3/qualityprofile": { status: 200, json: [{ id: 1, name: "Any" }] },
      "/api/v3/rootfolder": { status: 200, json: [{ path: "/tv" }] },
      "/api/v3/languageprofile": { status: 200, json: [{ id: 1, name: "English" }] },
    }),
  );
  assert.equal(sonarrV3.ok, true);
  if (sonarrV3.ok) assert.deepEqual(sonarrV3.data.languageProfiles, [{ id: 1, name: "English" }]);
});

test("connection failures are classified without throwing", async () => {
  assert.deepEqual(await probeArr("radarr", "http://down", "k", async () => ({ error: "unreachable" })), {
    ok: false,
    error: "unreachable",
  });
  const unauth = await probeTmdb("bad", "US", async () => ({ status: 401, json: { status_code: 7 } }));
  assert.deepEqual(unauth, { ok: false, error: "unauthorized" });
  const jf = await probeJellyfin("http://jf", "k", async () => ({ status: 401, json: null }));
  assert.deepEqual(jf, { ok: false, error: "unauthorized" });
  const skipped = await probeArr("radarr", "", "");
  assert.equal(skipped.ok, true);
  if (skipped.ok) assert.equal(skipped.skipped, true);
});

test("probeAll records per-service errors and keeps other lists", async () => {
  const lists = await probeAll(
    {
      ...emptySettings,
      tmdbApiKey: "k",
      country: "US",
      radarr: { url: "http://radarr", apiKey: "r", rootFolder: "", qualityProfileId: null },
      jellyfin: { url: "http://jf", apiKey: "j" },
    },
    fake({
      "/configuration": { status: 200, json: {} },
      "/watch/providers/regions": {
        status: 200,
        json: { results: [{ iso_3166_1: "US", english_name: "United States", native_name: "United States" }] },
      },
      "/watch/providers/movie": { status: 200, json: { results: [{ provider_id: 8, provider_name: "Netflix" }] } },
      "/watch/providers/tv": { status: 200, json: { results: [] } },
      "/api/v3/qualityprofile": { status: 401, json: null },
      "/api/v3/rootfolder": { status: 401, json: null },
      "/System/Info": { status: 200, json: { ServerName: "jf" } },
    }),
  );
  assert.deepEqual(lists.providers, [{ id: 8, name: "Netflix" }]);
  assert.equal(lists.tmdbReady, true);
  assert.equal(lists.radarr.ready, false);
  assert.equal(lists.errors.radarr, "unauthorized");
  assert.equal(lists.errors.jellyfin, undefined);
  assert.equal(lists.errors.tmdb, undefined);
});
