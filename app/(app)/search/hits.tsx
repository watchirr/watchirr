"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type Ref } from "react";
import { flushSync } from "react-dom";
import { PublicRatingSlots } from "@/app/public-rating-slots";
import { TitleRail } from "@/app/title-rail";
import type { ArrLists } from "@/lib/connect";
import { discoverListPath, type DiscoverRailId } from "@/lib/discover";
import type { Messages } from "@/lib/locale";
import type { PublicRatings } from "@/lib/ratings";
import { absentRatings, titleKey } from "@/lib/ratings";
import type { ArrSettings } from "@/lib/settings";
import { posterUrl, type Title } from "@/lib/tmdb";
import { loadSearchHeroAction } from "./actions";
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

function railLabel(t: Messages, id: DiscoverRailId): string {
  return {
    trending: t.discoverTrending,
    popular: t.discoverPopular,
    "just-released": t.discoverJustReleased,
    upcoming: t.discoverUpcoming,
  }[id];
}

function Art({ path, size, lazy }: { path: string | null; size?: "w185" | "w342"; lazy?: boolean }) {
  const src = posterUrl(path, size ?? "w185");
  return src ? <img className="art" src={src} alt="" loading={lazy ? "lazy" : undefined} /> : <div className="art" aria-hidden="true" />;
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

type CoveragePreview = { status: "loading" } | { status: "ok"; services: { id: number; name: string }[] } | { status: "unknown" };

type HeroPreview = {
  key: string;
  ratings: PublicRatings | null;
  coverage: CoveragePreview;
};

type HeroChrome = {
  t: Messages;
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  radarrLists: ArrLists;
  sonarrLists: ArrLists;
};

function coverageLine(preview: CoveragePreview, t: Messages): string {
  if (preview.status === "loading") return t.searchCoverageLoading;
  if (preview.status === "unknown") return t.searchCoverageUnknown;
  if (preview.services.length === 0) return t.searchCoverageNone;
  return t.watchlistServices.replace("{services}", preview.services.map((s) => s.name).join(", "));
}

function Meta({
  hit,
  t,
  saved,
  q,
  personId,
  fromList,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
  preview,
}: {
  hit: Title;
  t: Messages;
  saved: boolean;
  q: string;
  personId?: number;
  fromList?: { rail: DiscoverRailId; page: number };
  preview: HeroPreview | null;
} & HeroChrome) {
  const mine = preview?.key === titleKey(hit) ? preview : null;
  const loading = !mine || mine.ratings == null;
  const ratings = mine?.ratings ?? absentRatings;
  const coverage = mine?.coverage ?? { status: "loading" as const };
  const covered = coverage.status === "ok" && coverage.services.length > 0;
  return (
    <span className="meta">
      <span className="section-head extra">{t.searchSelected}</span>
      <span className="name">{hit.name}</span>
      <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
      <span className="sub extra">TMDB {hit.tmdbId}</span>
      <PublicRatingSlots ratings={ratings} t={t} loading={loading} />
      <span className={covered ? "sub tone-ok" : "sub"}>{coverageLine(coverage, t)}</span>
      {saved ? (
        <span className="sub">{t.searchOnList}</span>
      ) : (
        <AddWatchlist
          hit={hit}
          q={q}
          personId={personId}
          fromList={fromList}
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

function SearchHero({
  hit,
  saved,
  q,
  personId,
  fromList,
  preview,
  className,
  size,
  anchorRef,
  ...chrome
}: {
  hit: Title;
  saved: boolean;
  q: string;
  personId?: number;
  fromList?: { rail: DiscoverRailId; page: number };
  preview: HeroPreview | null;
  className?: string;
  size?: "w185" | "w342";
  anchorRef?: Ref<HTMLDivElement>;
} & HeroChrome) {
  return (
    <div ref={anchorRef} className={className ?? "hit hero"} aria-current="true">
      <Art path={hit.posterPath} size={size} />
      <Meta
        hit={hit}
        saved={saved}
        q={q}
        personId={personId}
        fromList={fromList}
        preview={preview}
        {...chrome}
      />
    </div>
  );
}

function useHeroPreview(selected: Title | undefined): HeroPreview | null {
  const [preview, setPreview] = useState<HeroPreview | null>(() =>
    selected ? { key: titleKey(selected), ratings: null, coverage: { status: "loading" } } : null,
  );
  const selectedId = selected?.tmdbId;
  const selectedKind = selected?.kind;

  useEffect(() => {
    if (!selectedId || !selectedKind) {
      setPreview(null);
      return;
    }
    const key = titleKey({ tmdbId: selectedId, kind: selectedKind });
    setPreview({ key, ratings: null, coverage: { status: "loading" } });
    let alive = true;
    void loadSearchHeroAction(selectedId, selectedKind).then((result) => {
      if (!alive) return;
      setPreview({
        key,
        ratings: result.ratings,
        coverage: result.coverage.ok ? { status: "ok", services: result.coverage.services } : { status: "unknown" },
      });
    });
    return () => {
      alive = false;
    };
  }, [selectedId, selectedKind]);

  return preview;
}

function writePick(hit: Title, extra: (url: URL) => void) {
  const url = new URL(window.location.href);
  extra(url);
  url.searchParams.set("tmdb", String(hit.tmdbId));
  url.searchParams.set("kind", hit.kind);
  url.searchParams.delete("err");
  history.replaceState(null, "", url);
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
}: {
  titles: Title[];
  q: string;
  personId?: number;
  selected?: Title;
  onList: string[];
  addError?: string;
  t: Messages;
} & HeroChrome) {
  const [selected, setSelected] = useState(initial);
  const preview = useHeroPreview(selected);
  const listed = new Set(onList);
  const chrome = { t, radarr, sonarr, radarrLists, sonarrLists };

  function pick(hit: Title) {
    if (selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind) return;
    morph(() => {
      flushSync(() => setSelected(hit));
      writePick(hit, (url) => {
        url.searchParams.set("q", q);
        if (personId) url.searchParams.set("person", String(personId));
        else url.searchParams.delete("person");
      });
    });
  }

  return (
    <>
      {addError ? <p className="error">{addError}</p> : null}
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
                <SearchHero hit={hit} saved={saved} q={q} personId={personId} preview={preview} {...chrome} />
              ) : (
                <button type="button" className="hit" onClick={() => pick(hit)}>
                  <Art path={hit.posterPath} />
                  <span className="meta">
                    <span className="name">{hit.name}</span>
                    <span className="sub">{[hit.year, kindLabel(t, hit.kind)].filter(Boolean).join(" · ")}</span>
                    {saved ? <span className="sub">{t.searchOnList}</span> : null}
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

export function DiscoverRails({
  rails,
  selected: initial,
  onList,
  addError,
  t,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
}: {
  rails: { id: DiscoverRailId; titles: Title[] }[];
  selected?: Title;
  onList: string[];
  addError?: string;
  t: Messages;
} & HeroChrome) {
  const [selected, setSelected] = useState(initial);
  const preview = useHeroPreview(selected);
  const listed = new Set(onList);
  const chrome = { t, radarr, sonarr, radarrLists, sonarrLists };
  const shown = rails.filter((rail) => rail.titles.length > 0);
  const heroRef = useRef<HTMLDivElement>(null);

  function pick(hit: Title) {
    const same = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
    if (!same) {
      flushSync(() => setSelected(hit));
      writePick(hit, (url) => {
        url.searchParams.delete("q");
        url.searchParams.delete("person");
      });
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heroRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  if (shown.length === 0 && !selected && !addError) return null;

  return (
    <div className="discover" role="region" aria-label={t.discoverTitle}>
      {addError ? <p className="error">{addError}</p> : null}
      {selected ? (
        <SearchHero
          hit={selected}
          saved={listed.has(keyOf(selected))}
          q=""
          preview={preview}
          className="hit hero feature-hero"
          size="w342"
          anchorRef={heroRef}
          {...chrome}
        />
      ) : null}
      {shown.map((rail) => {
        const label = railLabel(t, rail.id);
        return (
          <section key={rail.id} className="discover-rail">
            <div className="discover-head">
              <h2 className="section-head">{label}</h2>
              <Link
                className="discover-more"
                href={discoverListPath(rail.id)}
                aria-label={`${t.discoverSeeMore} · ${label}`}
              >
                {t.discoverSeeMore}
              </Link>
            </div>
            <TitleRail label={label} prevLabel={t.railPrev} nextLabel={t.railNext}>
              {rail.titles.map((hit) => {
                const on = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
                const saved = listed.has(keyOf(hit));
                return (
                  <li key={`${rail.id}-${hitId(hit)}`}>
                    <RailPoster hit={hit} saved={saved} current={on} onPick={pick} t={t} />
                  </li>
                );
              })}
            </TitleRail>
          </section>
        );
      })}
    </div>
  );
}

function RailPoster({
  hit,
  saved,
  current,
  onPick,
  t,
}: {
  hit: Title;
  saved: boolean;
  current: boolean;
  onPick: (hit: Title) => void;
  t: Messages;
}) {
  return (
    <button type="button" className="rail-card" onClick={() => onPick(hit)} aria-current={current || undefined}>
      <Art path={hit.posterPath} lazy />
      <span className="name">{hit.name}</span>
      {saved ? <span className="sub">{t.searchOnList}</span> : null}
    </button>
  );
}

export function DiscoverList({
  rail,
  titles,
  page,
  hasNext,
  selected: initial,
  onList,
  addError,
  t,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
}: {
  rail: DiscoverRailId;
  titles: Title[];
  page: number;
  hasNext: boolean;
  selected?: Title;
  onList: string[];
  addError?: string;
  t: Messages;
} & HeroChrome) {
  const [selected, setSelected] = useState(initial);
  const preview = useHeroPreview(selected);
  const listed = new Set(onList);
  const chrome = { t, radarr, sonarr, radarrLists, sonarrLists };
  const heroRef = useRef<HTMLDivElement>(null);
  const label = railLabel(t, rail);
  const fromList = { rail, page };

  function pick(hit: Title) {
    const same = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
    if (!same) {
      flushSync(() => setSelected(hit));
      writePick(hit, (url) => {
        url.searchParams.delete("q");
        url.searchParams.delete("person");
      });
    }
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heroRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
  }

  return (
    <div className="discover" role="region" aria-label={label}>
      {addError ? <p className="error">{addError}</p> : null}
      {selected ? (
        <SearchHero
          hit={selected}
          saved={listed.has(keyOf(selected))}
          q=""
          fromList={fromList}
          preview={preview}
          className="hit hero feature-hero"
          size="w342"
          anchorRef={heroRef}
          {...chrome}
        />
      ) : null}
      <section className="discover-rail">
        <div className="discover-head">
          <h1 className="section-head">{label}</h1>
        </div>
        {titles.length === 0 ? (
          <p className="muted">{t.discoverListEmpty}</p>
        ) : (
          <ul className="discover-wrap">
            {titles.map((hit) => {
              const on = selected?.tmdbId === hit.tmdbId && selected.kind === hit.kind;
              return (
                <li key={hitId(hit)}>
                  <RailPoster hit={hit} saved={listed.has(keyOf(hit))} current={on} onPick={pick} t={t} />
                </li>
              );
            })}
          </ul>
        )}
        {page > 1 || hasNext ? (
          <nav className="discover-pager" aria-label={t.discoverPage.replace("{page}", String(page))}>
            {page > 1 ? (
              <Link className="discover-more" href={discoverListPath(rail, page - 1)}>
                {t.railPrev}
              </Link>
            ) : null}
            <span className="muted">{t.discoverPage.replace("{page}", String(page))}</span>
            {hasNext ? (
              <Link className="discover-more" href={discoverListPath(rail, page + 1)}>
                {t.railNext}
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </div>
  );
}
