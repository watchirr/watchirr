"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import type { Messages } from "@/lib/locale";
import { posterUrl, type Title } from "@/lib/tmdb";
import { addWatchlistAction } from "./actions";

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
}: {
  hit: Title;
  t: Messages;
  saved: boolean;
  q: string;
  personId?: number;
}) {
  return (
    <span className="meta">
      <span className="section-head extra">{t.searchSelected}</span>
      <span className="name">{hit.name}</span>
      <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
      <span className="sub extra">TMDB {hit.tmdbId}</span>
      {saved ? (
        <span className="sub">{t.searchOnList}</span>
      ) : (
        <form action={addWatchlistAction} className="add-form">
          <input type="hidden" name="tmdbId" value={hit.tmdbId} />
          <input type="hidden" name="kind" value={hit.kind} />
          <input type="hidden" name="name" value={hit.name} />
          <input type="hidden" name="year" value={hit.year ?? ""} />
          <input type="hidden" name="posterPath" value={hit.posterPath ?? ""} />
          <input type="hidden" name="q" value={q} />
          {personId ? <input type="hidden" name="person" value={personId} /> : null}
          <button type="submit" className="add-btn">
            {t.searchAdd}
          </button>
        </form>
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
}: {
  titles: Title[];
  q: string;
  personId?: number;
  selected?: Title;
  onList: string[];
  addError?: string;
  t: Messages;
}) {
  const [selected, setSelected] = useState(initial);
  const listed = new Set(onList);

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
      {addError ? <p className="error">{t.searchAddFailed}</p> : null}
      <ul className="hits">
        {titles.map((hit) => {
          const on = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
          const saved = listed.has(keyOf(hit));
          return (
            <li
              key={hitId(hit)}
              className={on ? "hero-slot" : undefined}
              style={{ viewTransitionName: hitId(hit) }}
            >
              {on ? (
                <div className="hit hero" aria-current="true">
                  <Art path={hit.posterPath} />
                  <Meta hit={hit} t={t} saved={saved} q={q} personId={personId} />
                </div>
              ) : (
                <button type="button" className="hit" onClick={() => pick(hit)}>
                  <Art path={hit.posterPath} />
                  <span className="meta">
                    <span className="section-head extra">{t.searchSelected}</span>
                    <span className="name">{hit.name}</span>
                    <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
                    <span className="sub extra">TMDB {hit.tmdbId}</span>
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
