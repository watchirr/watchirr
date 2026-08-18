"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import { PublicRatingSlots } from "@/app/public-rating-slots";
import type { ArrLists } from "@/lib/connect";
import type { Messages } from "@/lib/locale";
import type { PublicRatings } from "@/lib/ratings";
import { absentRatings, titleKey } from "@/lib/ratings";
import type { ArrSettings } from "@/lib/settings";
import { posterUrl, type Title } from "@/lib/tmdb";
import { AddWatchlist } from "./add-watchlist";

function kindLabel(t: Messages, kind: Title["kind"]): string {
  return kind === "movie" ? t.searchKindMovie : t.searchKindTv;
}

function hitId(hit: Title): string {
  return `hit-${hit.kind}-${hit.tmdbId}`;
}

function keyOf(hit: Title): string {
  return `${hit.kind}:${hit.tmdbId}`;
}

function Art({ path }: { path: string | null }) {
  const src = posterUrl(path);
  return src ? <img className="art" src={src} alt="" /> : <div className="art" aria-hidden="true" />;
}

let currentVt: ViewTransition | undefined;

function morph(update: () => void): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  currentVt?.skipTransition();
  currentVt = document.startViewTransition(update);
}

function Meta({
  hit,
  t,
  saved,
  q,
  personId,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
  ratings,
}: {
  hit: Title;
  t: Messages;
  saved: boolean;
  q: string;
  personId?: number;
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  radarrLists: ArrLists;
  sonarrLists: ArrLists;
  ratings: PublicRatings;
}) {
  return (
    <span className="meta">
      <span className="section-head extra">{t.searchSelected}</span>
      <span className="name">{hit.name}</span>
      <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
      <span className="sub extra">TMDB {hit.tmdbId}</span>
      <PublicRatingSlots ratings={ratings} t={t} />
      {saved ? (
        <span className="sub">{t.searchOnList}</span>
      ) : (
        <AddWatchlist
          hit={hit}
          q={q}
          personId={personId}
          t={t}
          radarr={radarr}
          sonarr={sonarr}
          radarrLists={radarrLists}
          sonarrLists={sonarrLists}
        />
      )}
    </span>
  );
}

export function SearchHits({
  titles,
  q,
  personId,
  selected: initial,
  onList,
  addError,
  t,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
  ratingsByKey,
}: {
  titles: Title[];
  q: string;
  personId?: number;
  selected?: Title;
  onList: string[];
  addError?: string;
  t: Messages;
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  radarrLists: ArrLists;
  sonarrLists: ArrLists;
  ratingsByKey: Record<string, PublicRatings>;
}) {
  const [selected, setSelected] = useState(initial);
  const listed = new Set(onList);

  function ratingsFor(hit: Title): PublicRatings {
    return ratingsByKey[titleKey(hit)] ?? absentRatings;
  }

  function pick(hit: Title) {
    if (selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind) return;
    const url = new URL(window.location.href);
    url.searchParams.set("q", q);
    if (personId) url.searchParams.set("person", String(personId));
    else url.searchParams.delete("person");
    url.searchParams.set("tmdb", String(hit.tmdbId));
    url.searchParams.set("kind", hit.kind);
    url.searchParams.delete("err");

    morph(() => {
      flushSync(() => setSelected(hit));
      history.replaceState(null, "", url);
    });
  }

  return (
    <>
      {addError ? <p className="error">{addError}</p> : null}
      <ul className="hits">
        {titles.map((hit) => {
          const on = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
          const saved = listed.has(keyOf(hit));
          const ratings = ratingsFor(hit);
          return (
            <li
              key={hitId(hit)}
              className={on ? "hero-slot" : undefined}
              style={{ viewTransitionName: hitId(hit) }}
            >
              {on ? (
                <div className="hit hero" aria-current="true">
                  <Art path={hit.posterPath} />
                  <Meta
                    hit={hit}
                    t={t}
                    saved={saved}
                    q={q}
                    personId={personId}
                    radarr={radarr}
                    sonarr={sonarr}
                    radarrLists={radarrLists}
                    sonarrLists={sonarrLists}
                    ratings={ratings}
                  />
                </div>
              ) : (
                <button type="button" className="hit" onClick={() => pick(hit)}>
                  <Art path={hit.posterPath} />
                  <span className="meta">
                    <span className="section-head extra">{t.searchSelected}</span>
                    <span className="name">{hit.name}</span>
                    <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
                    <span className="sub extra">TMDB {hit.tmdbId}</span>
                    <PublicRatingSlots ratings={ratings} t={t} compact />
                  </span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
