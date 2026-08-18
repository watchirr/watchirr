import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpGet } from "./connect.ts";
import { discoverCatalog, discoverListPath, isDiscoverRailId, type DiscoverInput, type DiscoverRailId } from "./discover.ts";

const NOW = new Date("2026-08-18T12:00:00.000Z");
const MIX_RAILS = ["popular", "just-released", "upcoming"] as const satisfies DiscoverRailId[];

function base(over: Partial<DiscoverInput> = {}): DiscoverInput {
  return {
    apiKey: "k",
    language: "pt-BR",
    filter: "all",
    country: "BR",
    rail: "trending",
    page: 1,
    now: NOW,
    ...over,
  };
}

function movie(id: number, title: string, release: string) {
  return { id, title, release_date: release, poster_path: `/${id}.jpg` };
}

function tv(id: number, name: string, firstAir: string, mediaType?: "tv") {
  return { id, name, first_air_date: firstAir, poster_path: `/${id}.jpg`, ...(mediaType ? { media_type: mediaType } : {}) };
}

function pageJson(results: unknown[], page = 1, totalPages = 1) {
  return { status: 200 as const, json: { page, total_pages: totalPages, results } };
}

test("discoverCatalog maps missing and blank keys without HTTP", async () => {
  let called = 0;
  const spy: HttpGet = async () => {
    called += 1;
    return { error: "unreachable" };
  };
  assert.deepEqual(await discoverCatalog(base({ apiKey: "" }), spy), { ok: false, error: "missing-key" });
  assert.deepEqual(await discoverCatalog(base({ apiKey: "  " }), spy), { ok: false, error: "missing-key" });
  assert.equal(called, 0);
});

test("Trending week All keeps TMDB mixed order and does not re-interleave", async () => {
  const urls: string[] = [];
  const result = await discoverCatalog(base({ rail: "trending", language: "en-US" }), async (url) => {
    urls.push(url);
    return pageJson([
      { media_type: "movie", id: 1, title: "A", release_date: "2026-01-01", poster_path: "/a.jpg" },
      { media_type: "movie", id: 2, title: "B", release_date: "2026-01-02", poster_path: "/b.jpg" },
      { media_type: "tv", id: 3, name: "C", first_air_date: "2026-01-03", poster_path: "/c.jpg" },
      { media_type: "person", id: 4, name: "Nope" },
    ]);
  });
  assert.equal(urls.length, 1);
  assert.match(urls[0] ?? "", /\/trending\/all\/week\?/);
  assert.match(urls[0] ?? "", /language=en-US/);
  assert.equal(new URL(urls[0] ?? "").searchParams.get("region"), null);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.titles.map((t) => t.tmdbId),
    [1, 2, 3],
  );
  assert.deepEqual(
    result.titles.map((t) => t.kind),
    ["movie", "movie", "tv"],
  );
  assert.equal(result.page, 1);
  assert.equal(result.hasNext, false);
});

test("Movie / TV kind filter drops the other kind on every rail", async () => {
  for (const rail of ["trending", ...MIX_RAILS] as const) {
    const urls: string[] = [];
    const movieOnly = await discoverCatalog(base({ rail, filter: "movie" }), async (url) => {
      urls.push(url);
      if (url.includes("/tv/") || url.includes("/trending/tv") || url.includes("/trending/all")) {
        return pageJson([tv(99, "Leak", "2026-08-01", "tv")]);
      }
      return pageJson([movie(1, "Only", "2026-08-01")]);
    });
    assert.equal(movieOnly.ok, true);
    if (movieOnly.ok) {
      assert.equal(movieOnly.titles.length, 1);
      assert.equal(movieOnly.titles[0]?.kind, "movie");
    }
    assert.equal(urls.some((u) => u.includes("/tv/") || u.includes("/trending/tv") || u.includes("/trending/all")), false);

    urls.length = 0;
    const tvOnly = await discoverCatalog(base({ rail, filter: "tv" }), async (url) => {
      urls.push(url);
      if (url.includes("/movie/") || url.includes("/trending/movie") || url.includes("/trending/all")) {
        return pageJson([movie(88, "Leak", "2026-08-01")]);
      }
      return pageJson([tv(2, "Only", "2026-08-01")]);
    });
    assert.equal(tvOnly.ok, true);
    if (tvOnly.ok) {
      assert.equal(tvOnly.titles.length, 1);
      assert.equal(tvOnly.titles[0]?.kind, "tv");
    }
    assert.equal(urls.some((u) => u.includes("/movie/") || u.includes("/trending/movie") || u.includes("/trending/all")), false);
  }
});

test("Popular / Just released / Upcoming All interleaves movie and TV (zip, not concatenate)", async () => {
  for (const rail of MIX_RAILS) {
    const result = await discoverCatalog(base({ rail }), async (url) => {
      if (url.includes("/movie/") || url.includes("/discover/movie")) {
        return pageJson([movie(1, "M1", "2026-08-10"), movie(2, "M2", "2026-08-11")]);
      }
      return pageJson([tv(10, "T1", "2026-08-10"), tv(11, "T2", "2026-08-11")]);
    });
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(
      result.titles.map((t) => t.tmdbId),
      [1, 10, 2, 11],
    );
    assert.deepEqual(
      result.titles.map((t) => t.kind),
      ["movie", "tv", "movie", "tv"],
    );
  }
});

test("Just released is first public dates in the last 30 days; old series stay out", async () => {
  const result = await discoverCatalog(base({ rail: "just-released" }), async (url) => {
    const u = new URL(url);
    assert.match(u.pathname, /\/discover\/(movie|tv)$/);
    assert.equal(u.pathname.includes("now_playing") || u.pathname.includes("on_the_air"), false);
    if (u.pathname.endsWith("/discover/movie")) {
      const gte = u.searchParams.get("primary_release_date.gte") ?? "";
      const lte = u.searchParams.get("primary_release_date.lte") ?? "";
      const rows = [movie(1, "Fresh", "2026-08-10"), movie(2, "Old", "2020-01-01")].filter(
        (r) => r.release_date >= gte && r.release_date <= lte,
      );
      return pageJson(rows);
    }
    const gte = u.searchParams.get("first_air_date.gte") ?? "";
    const lte = u.searchParams.get("first_air_date.lte") ?? "";
    const rows = [tv(3, "New Show", "2026-08-01"), tv(1396, "Breaking Bad", "2008-01-20")].filter(
      (r) => r.first_air_date >= gte && r.first_air_date <= lte,
    );
    return pageJson(rows);
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.titles.map((t) => t.tmdbId),
    [1, 3],
  );
  assert.equal(result.titles.some((t) => t.tmdbId === 1396 || t.tmdbId === 2), false);
});

test("Upcoming is first public dates in the next 90 days", async () => {
  const result = await discoverCatalog(base({ rail: "upcoming" }), async (url) => {
    const u = new URL(url);
    assert.match(u.pathname, /\/discover\/(movie|tv)$/);
    if (u.pathname.endsWith("/discover/movie")) {
      const gte = u.searchParams.get("primary_release_date.gte") ?? "";
      const lte = u.searchParams.get("primary_release_date.lte") ?? "";
      const rows = [movie(1, "Soon", "2026-09-01"), movie(2, "Far", "2026-12-01")].filter(
        (r) => r.release_date >= gte && r.release_date <= lte,
      );
      return pageJson(rows);
    }
    const gte = u.searchParams.get("first_air_date.gte") ?? "";
    const lte = u.searchParams.get("first_air_date.lte") ?? "";
    const rows = [tv(3, "Soon Show", "2026-10-01"), tv(4, "Far Show", "2027-08-01")].filter(
      (r) => r.first_air_date >= gte && r.first_air_date <= lte,
    );
    return pageJson(rows);
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.titles.map((t) => t.tmdbId),
    [1, 3],
  );
  assert.equal(result.titles.some((t) => t.tmdbId === 2 || t.tmdbId === 4), false);
});

test("Popular and date rails use coverage country as region, not Locale", async () => {
  for (const rail of MIX_RAILS) {
    const urls: string[] = [];
    const result = await discoverCatalog(base({ rail, language: "pt-BR", country: "BR" }), async (url) => {
      urls.push(url);
      return pageJson([]);
    });
    assert.equal(result.ok, true);
    const movieUrl = urls.find((u) => u.includes("/movie/") || u.includes("/discover/movie"));
    assert.ok(movieUrl);
    const params = new URL(movieUrl!).searchParams;
    assert.equal(params.get("region"), "BR");
    assert.equal(params.get("language"), "pt-BR");
    assert.notEqual(params.get("region"), "pt-BR");
  }

  const trending: string[] = [];
  await discoverCatalog(base({ rail: "trending", language: "pt-BR", country: "BR" }), async (url) => {
    trending.push(url);
    return pageJson([]);
  });
  assert.equal(new URL(trending[0] ?? "").searchParams.get("region"), null);
});

test("page 2 is a different list than page 1", async () => {
  const fake: HttpGet = async (url) => {
    const page = Number(new URL(url).searchParams.get("page") ?? "1");
    return pageJson([movie(page, `P${page}`, "2026-08-01")], page, 2);
  };
  const first = await discoverCatalog(base({ rail: "popular", filter: "movie", page: 1 }), fake);
  const second = await discoverCatalog(base({ rail: "popular", filter: "movie", page: 2 }), fake);
  assert.equal(first.ok && second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(
    first.titles.map((t) => t.tmdbId),
    [1],
  );
  assert.deepEqual(
    second.titles.map((t) => t.tmdbId),
    [2],
  );
  assert.notDeepEqual(first.titles, second.titles);
  assert.equal(first.hasNext, true);
  assert.equal(second.hasNext, false);
  assert.equal(first.totalPages, 2);
});

test("empty catalog page is empty", async () => {
  const result = await discoverCatalog(base({ rail: "just-released" }), async () => pageJson([]));
  assert.deepEqual(result, { ok: true, titles: [], page: 1, totalPages: 1, hasNext: false });
});

test("Discover list URLs stay under Search and encode TMDB page", () => {
  assert.equal(discoverListPath("trending"), "/search/trending");
  assert.equal(discoverListPath("popular"), "/search/popular");
  assert.equal(discoverListPath("just-released", 2), "/search/just-released?page=2");
  assert.equal(discoverListPath("upcoming", 1), "/search/upcoming");
  assert.equal(discoverListPath("trending", 0), "/search/trending");
  assert.equal(isDiscoverRailId("trending"), true);
  assert.equal(isDiscoverRailId("now-playing"), false);
});

test("Discover drops Titles with no poster and keeps catalog order of the rest", async () => {
  const result = await discoverCatalog(base({ rail: "just-released", filter: "movie" }), async () =>
    pageJson([
      movie(1, "Has art", "2026-08-10"),
      { id: 2, title: "No art", release_date: "2026-08-11", poster_path: null },
      movie(3, "Also art", "2026-08-12"),
      { id: 4, title: "Empty path", release_date: "2026-08-13", poster_path: "" },
    ]),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.titles.map((t) => t.tmdbId),
    [1, 3],
  );
});
