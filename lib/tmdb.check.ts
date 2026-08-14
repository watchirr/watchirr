import assert from "node:assert/strict";
import { test } from "node:test";
import type { HttpGet } from "./connect.ts";
import { parseCastCredits, parseKindFilter, parsePersonResults, parseSearchResults, parseTitleRef, personCast, posterUrl, searchPeople, searchTitles, titleCoverage } from "./tmdb.ts";

test("parseSearchResults keeps movie and TV with stable TMDB id + kind; drops people", () => {
  const titles = parseSearchResults({
    results: [
      { media_type: "person", id: 1, name: "Brad Pitt" },
      {
        media_type: "movie",
        id: 550,
        title: "Fight Club",
        release_date: "1999-10-15",
        poster_path: "/fight.jpg",
      },
      {
        media_type: "tv",
        id: 1396,
        name: "Breaking Bad",
        first_air_date: "2008-01-20",
        poster_path: "/bb.jpg",
      },
      { media_type: "movie", id: 0, title: "Nope" },
      { media_type: "collection", id: 10, name: "Alien Collection" },
    ],
  });
  assert.deepEqual(titles, [
    { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: "/fight.jpg" },
    { tmdbId: 1396, kind: "tv", name: "Breaking Bad", year: 2008, posterPath: "/bb.jpg" },
  ]);
});

test("parseTitleRef is the Title identity; posterUrl stays on small TMDB sizes", () => {
  assert.deepEqual(parseTitleRef("550", "movie"), { tmdbId: 550, kind: "movie" });
  assert.deepEqual(parseTitleRef("1396", "tv"), { tmdbId: 1396, kind: "tv" });
  assert.equal(parseTitleRef("550", "person"), null);
  assert.equal(parseTitleRef("", "movie"), null);
  assert.equal(posterUrl("/fight.jpg"), "https://image.tmdb.org/t/p/w185/fight.jpg");
  assert.equal(posterUrl(null), null);
  assert.equal(parseKindFilter("movie"), "movie");
  assert.equal(parseKindFilter("tv"), "tv");
  assert.equal(parseKindFilter("all"), "all");
  assert.equal(parseKindFilter("person"), "all");
  assert.equal(parseKindFilter(null), "all");
});

test("parsePersonResults caps people; parseCastCredits is cast-only Titles sorted by popularity", () => {
  const people = parsePersonResults({
    results: [
      { id: 287, name: "Brad Pitt", profile_path: "/pitt.jpg", known_for_department: "Acting" },
      { id: 0, name: "Nope" },
      { id: 31, name: "Tom Hanks", profile_path: null },
    ],
  });
  assert.deepEqual(people, [
    { tmdbId: 287, name: "Brad Pitt", profilePath: "/pitt.jpg", department: "Acting" },
    { tmdbId: 31, name: "Tom Hanks", profilePath: null, department: null },
  ]);

  const titles = parseCastCredits(
    {
      crew: [{ media_type: "movie", id: 1, title: "Directed", popularity: 99 }],
      cast: [
        { media_type: "movie", id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/f.jpg", popularity: 10 },
        { media_type: "tv", id: 1399, name: "GoT", first_air_date: "2011-04-17", poster_path: "/g.jpg", popularity: 80 },
        { media_type: "movie", id: 550, title: "Fight Club", popularity: 10 },
        { media_type: "person", id: 9, name: "Nope", popularity: 100 },
      ],
    },
    2,
  );
  assert.deepEqual(titles, [
    { tmdbId: 1399, kind: "tv", name: "GoT", year: 2011, posterPath: "/g.jpg" },
    { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: "/f.jpg" },
  ]);
  assert.deepEqual(
    parseCastCredits(
      {
        cast: [
          { media_type: "movie", id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/f.jpg", popularity: 10 },
          { media_type: "tv", id: 1399, name: "GoT", first_air_date: "2011-04-17", poster_path: "/g.jpg", popularity: 80 },
        ],
      },
      40,
      "movie",
    ),
    [{ tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: "/f.jpg" }],
  );
});

test("searchPeople and personCast hit TMDB person endpoints; missing key skips HTTP", async () => {
  let called = 0;
  const spy: HttpGet = async () => {
    called += 1;
    return { error: "unreachable" };
  };
  assert.deepEqual(await searchPeople("", "pitt", "en-US", spy), { ok: false, error: "missing-key" });
  assert.deepEqual(await personCast("", 287, "en-US", "all", spy), { ok: false, error: "missing-key" });
  assert.equal(called, 0);

  const urls: string[] = [];
  const people = await searchPeople("k", "pitt", "en-US", async (url) => {
    urls.push(url);
    return { status: 200, json: { results: [{ id: 287, name: "Brad Pitt", profile_path: "/p.jpg" }] } };
  });
  assert.match(urls[0] ?? "", /\/search\/person\?/);
  assert.equal(people.ok, true);
  if (people.ok) assert.equal(people.people[0]?.tmdbId, 287);

  const cast = await personCast("k", 287, "pt-BR", "all", async (url) => {
    urls.push(url);
    if (url.includes("/combined_credits")) {
      return {
        status: 200,
        json: { cast: [{ media_type: "movie", id: 550, title: "Fight Club", release_date: "1999-10-15", popularity: 1 }] },
      };
    }
    return { status: 200, json: { id: 287, name: "Brad Pitt", profile_path: "/p.jpg" } };
  });
  assert.equal(cast.ok, true);
  if (cast.ok) {
    assert.equal(cast.person.name, "Brad Pitt");
    assert.equal(cast.titles[0]?.tmdbId, 550);
  }
});

test("searchTitles maps missing and invalid keys without throwing", async () => {
  let called = 0;
  const spy: HttpGet = async () => {
    called += 1;
    return { error: "unreachable" };
  };
  assert.deepEqual(await searchTitles("", "fight", "en-US", "all", spy), { ok: false, error: "missing-key" });
  assert.equal(called, 0);

  const empty = await searchTitles("k", "  ", "en-US", "all", spy);
  assert.deepEqual(empty, { ok: true, titles: [] });
  assert.equal(called, 0);

  const unauth = await searchTitles("bad", "fight", "pt-BR", "all", async () => ({ status: 401, json: { status_code: 7 } }));
  assert.deepEqual(unauth, { ok: false, error: "unauthorized" });
});

test("searchTitles hits TMDB multi and returns parsed Titles", async () => {
  let seen = "";
  const result = await searchTitles("k", "fight", "pt-BR", "all", async (url) => {
    seen = url;
    return {
      status: 200,
      json: {
        results: [{ media_type: "movie", id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/x.jpg" }],
      },
    };
  });
  assert.match(seen, /\/search\/multi\?/);
  assert.match(seen, /api_key=k/);
  assert.match(seen, /query=fight/);
  assert.match(seen, /language=pt-BR/);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.titles, [
      { tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: "/x.jpg" },
    ]);
  }
});

test("searchTitles movie/tv endpoints force kind because TMDB omits media_type", async () => {
  assert.deepEqual(
    parseSearchResults({ results: [{ id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/x.jpg" }] }, "movie"),
    [{ tmdbId: 550, kind: "movie", name: "Fight Club", year: 1999, posterPath: "/x.jpg" }],
  );

  let seen = "";
  const result = await searchTitles("k", "fight", "pt-BR", "movie", async (url) => {
    seen = url;
    return {
      status: 200,
      json: { results: [{ id: 550, title: "Fight Club", release_date: "1999-10-15", poster_path: "/x.jpg" }] },
    };
  });
  assert.match(seen, /\/search\/movie\?/);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.titles[0]?.kind, "movie");

  const tv = await searchTitles("k", "bad", "en-US", "tv", async (url) => {
    seen = url;
    return { status: 200, json: { results: [{ id: 1396, name: "Breaking Bad", first_air_date: "2008-01-20" }] } };
  });
  assert.match(seen, /\/search\/tv\?/);
  assert.equal(tv.ok, true);
  if (tv.ok) assert.equal(tv.titles[0]?.kind, "tv");
});

test("titleCoverage hits watch/providers and keeps flatrate ∩ Paid Services only", async () => {
  let seen = "";
  const covered = await titleCoverage("k", { tmdbId: 550, kind: "movie" }, "US", [8], async (url) => {
    seen = url;
    return {
      status: 200,
      json: {
        results: {
          US: {
            flatrate: [{ provider_id: 8, provider_name: "Netflix" }],
            rent: [{ provider_id: 2, provider_name: "Apple TV" }],
          },
        },
      },
    };
  });
  assert.match(seen, /\/movie\/550\/watch\/providers/);
  assert.deepEqual(covered, { ok: true, services: [{ id: 8, name: "Netflix" }] });

  const rentOnly = await titleCoverage("k", { tmdbId: 1396, kind: "tv" }, "US", [8], async (url) => {
    seen = url;
    return {
      status: 200,
      json: { results: { US: { rent: [{ provider_id: 8, provider_name: "Netflix" }] } } },
    };
  });
  assert.match(seen, /\/tv\/1396\/watch\/providers/);
  assert.deepEqual(rentOnly, { ok: true, services: [] });
});
