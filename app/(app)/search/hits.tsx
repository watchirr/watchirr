"use client";

import { useState } from "react";
import { flushSync } from "react-dom";
import type { Messages } from "@/lib/locale";
import { posterUrl, type Title } from "@/lib/tmdb";

function kindLabel(t: Messages, kind: Title["kind"]): string {
  return kind === "movie" ? t.searchKindMovie : t.searchKindTv;
}

function hitId(hit: Title): string {
  return `hit-${hit.kind}-${hit.tmdbId}`;
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

export function SearchHits({
  titles,
  q,
  personId,
  selected: initial,
  t,
}: {
  titles: Title[];
  q: string;
  personId?: number;
  selected?: Title;
  t: Messages;
}) {
  const [selected, setSelected] = useState(initial);

  function pick(hit: Title) {
    if (selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind) return;
    const url = new URL(window.location.href);
    url.searchParams.set("q", q);
    if (personId) url.searchParams.set("person", String(personId));
    else url.searchParams.delete("person");
    url.searchParams.set("tmdb", String(hit.tmdbId));
    url.searchParams.set("kind", hit.kind);

    morph(() => {
      flushSync(() => setSelected(hit));
      history.replaceState(null, "", url);
    });
  }

  return (
    <ul className="hits">
      {titles.map((hit) => {
        const on = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
        return (
          <li
            key={hitId(hit)}
            className={on ? "hero-slot" : undefined}
            style={{ viewTransitionName: hitId(hit) }}
          >
            <button
              type="button"
              className={on ? "hit hero" : "hit"}
              aria-current={on ? "true" : undefined}
              onClick={() => pick(hit)}
            >
              <Art path={hit.posterPath} />
              <span className="meta">
                <span className="section-head extra">{t.searchSelected}</span>
                <span className="name">{hit.name}</span>
                <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
                <span className="sub extra">TMDB {hit.tmdbId}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
