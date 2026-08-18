import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicRatingSlots } from "../public-rating-slots";
import { TitleRail } from "../title-rail";
import { ExpandSeasons } from "./expand-seasons";
import { MarkWatched } from "./mark-watched";
import { RemoveItem } from "./remove-item";
import { watchlistHref } from "./watchlist-path";
import { access, currentLocale, currentTitleKind } from "@/lib/http";
import { jellyfinProgress } from "@/lib/jellyfin";
import { messages, type Messages } from "@/lib/locale";
import {
  absentRatings,
  asRef,
  getRatingsCache,
  pickFeatured,
  resolveMany,
  ratingsDepsFromStore,
  titleKey,
  type PublicRatings,
} from "@/lib/ratings";
import { getSettings } from "@/lib/settings";
import { posterUrl } from "@/lib/tmdb";
import {
  byKind,
  filterCounts,
  filterItems,
  listItems,
  parseWatchlistSection,
  parseWatchlistView,
  sectionCounts,
  sectionItems,
  syncJellyfinWatched,
  type WatchlistItem,
  type WatchlistSection,
  type WatchlistView,
} from "@/lib/watchlist";

export const dynamic = "force-dynamic";

function Art({ path, size }: { path: string | null; size?: "w185" | "w342" }) {
  const src = posterUrl(path, size ?? "w185");
  return src ? <img className="art" src={src} alt="" loading="lazy" /> : <div className="art" aria-hidden="true" />;
}

function arrFail(t: Messages, error: string): string {
  if (error === "missing-seasons") return t.searchAddMissingSeasons;
  if (error === "missing-defaults") return t.searchAddMissingDefaults;
  if (error === "missing-tvdb") return t.searchAddMissingTvdb;
  if (error === "not-found") return t.searchAddNotFound.replace("{service}", "Radarr/Sonarr");
  if (error === "arr-unauthorized") return t.searchAddArrUnauthorized.replace("{service}", "Radarr/Sonarr");
  if (error === "arr-unreachable" || error === "arr-failed") {
    return t.searchAddArrFailed.replace("{service}", "Radarr/Sonarr");
  }
  return t.searchAddFailed;
}

function statusLine(item: WatchlistItem, t: Messages): { text: string; tone: string } {
  if (item.watched) return { text: t.watchlistWatched, tone: "sub tone-ok" };
  if (item.inLibrary) return { text: t.watchlistInLibrary, tone: "sub tone-ok" };
  if (item.shouldAcquire) return { text: t.watchlistNeedsAcquire, tone: "sub tone-warn" };
  return {
    text: t.watchlistServices.replace("{services}", item.services.map((s) => s.name).join(", ")),
    tone: "sub tone-ok",
  };
}

function ItemActions({
  item,
  view,
  section,
  t,
}: {
  item: WatchlistItem;
  view: WatchlistView;
  section: WatchlistSection;
  t: Messages;
}) {
  const hit = item.title;
  return (
    <div className="item-actions">
      {item.inLibrary && hit.kind === "tv" && !item.watched ? (
        <ExpandSeasons tmdbId={hit.tmdbId} title={hit.name} t={t} />
      ) : null}
      {!item.watched ? (
        <MarkWatched
          tmdbId={hit.tmdbId}
          kind={hit.kind}
          view={view}
          section={section}
          title={hit.name}
          t={t}
        />
      ) : null}
      <RemoveItem
        tmdbId={hit.tmdbId}
        kind={hit.kind}
        view={view}
        section={section}
        title={hit.name}
        canKeepFiles={item.inLibrary || item.shouldAcquire}
        t={t}
      />
    </div>
  );
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; section?: string; err?: string }>;
}) {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const t = messages[await currentLocale()];
  const params = await searchParams;
  const settings = await getSettings(store);
  await syncJellyfinWatched(store, { progress: jellyfinProgress(settings) });

  const paid = settings.paidServiceIds.length;
  const view = parseWatchlistView(params.view, paid);
  const section = parseWatchlistSection(params.section);

  const listed = await listItems(store);
  const all = byKind(listed, await currentTitleKind());
  const filtered = filterItems(all, view);
  const inSection = sectionItems(filtered, section);
  const counts = filterCounts(sectionItems(all, section));
  const sections = sectionCounts(filtered);
  const arrError = params.err ? arrFail(t, params.err) : undefined;

  const cache = await getRatingsCache(store);
  const deps = ratingsDepsFromStore(store, settings, cache);
  const ratingMap = await resolveMany(
    inSection.map((i) => asRef(i.title)),
    deps,
  );

  const candidates = inSection.map((i) => {
    const key = titleKey(asRef(i.title));
    return {
      key,
      tomato: ratingMap.get(key)?.tomato ?? null,
      addedAt: i.addedAt,
    };
  });
  const useTomato = section === "unwatched";
  const pick = pickFeatured(candidates, useTomato);
  const byKey = new Map(inSection.map((i) => [titleKey(asRef(i.title)), i]));
  const featured = pick.featuredKey ? byKey.get(pick.featuredKey) : undefined;
  const rail = pick.remainderKeys.map((k) => byKey.get(k)).filter((i): i is WatchlistItem => Boolean(i));

  const filters: { view: WatchlistView; label: string; hint?: string; count: number }[] = [
    { view: "all", label: t.watchlistAll, count: counts.all },
    ...(paid > 0
      ? [{ view: "covered" as const, label: t.watchlistCovered, hint: t.watchlistCoveredHint, count: counts.covered }]
      : []),
    { view: "library", label: t.watchlistInLibrary, hint: t.watchlistInLibraryHint, count: counts.library },
  ];

  const sectionTabs: { section: WatchlistSection; label: string; count: number }[] = [
    { section: "all", label: t.watchlistAll, count: sections.all },
    { section: "unwatched", label: t.watchlistNotWatched, count: sections.unwatched },
    { section: "watched", label: t.watchlistWatched, count: sections.watched },
  ];

  function ratingsFor(item: WatchlistItem): PublicRatings {
    return ratingMap.get(titleKey(asRef(item.title))) ?? absentRatings;
  }

  return (
    <main className="main watchlist-main">
      {listed.length === 0 ? (
        <section className="panel glass wide">
          <h1 className="section-head">{t.navWatchlist}</h1>
          <p className="muted">{t.watchlistEmpty}</p>
        </section>
      ) : (
        <div className="watchlist-lens">
          <aside className="panel glass filters-aside" aria-label={t.watchlistFilter}>
            <p className="section-head">{t.watchlistFilter}</p>
            <nav className="filter-list">
              {filters.map((tab) => (
                <Link
                  key={tab.view}
                  href={watchlistHref({ section, view: tab.view })}
                  className={view === tab.view ? "on" : undefined}
                  aria-current={view === tab.view ? "page" : undefined}
                >
                  <span className="filter-copy">
                    <span className="filter-label">{tab.label}</span>
                    {tab.hint ? <span className="filter-hint">{tab.hint}</span> : null}
                  </span>
                  <span className="count">{tab.count}</span>
                </Link>
              ))}
            </nav>
          </aside>

          <section className="panel glass wide watchlist-body">
            {arrError ? <p className="error">{arrError}</p> : null}
            <nav className="lens" aria-label={t.watchlistStatusFilter}>
              {sectionTabs.map((tab) => (
                <Link
                  key={tab.section}
                  href={watchlistHref({ section: tab.section, view })}
                  className={section === tab.section ? "on" : undefined}
                  aria-current={section === tab.section ? "page" : undefined}
                >
                  {tab.label}
                  <span className="lens-count">{tab.count}</span>
                </Link>
              ))}
            </nav>

            {inSection.length === 0 ? (
              <p className="muted">{t.watchlistNoneMatch}</p>
            ) : featured ? (
              <>
                <div className="hit hero feature-hero">
                  <Art path={featured.title.posterPath} size="w342" />
                  <span className="meta">
                    <span className="name">{featured.title.name}</span>
                    <span className="sub">
                      {[
                        featured.title.year,
                        featured.title.kind === "movie" ? t.searchKindMovie : t.searchKindTv,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                    <span className={statusLine(featured, t).tone}>{statusLine(featured, t).text}</span>
                    <PublicRatingSlots ratings={ratingsFor(featured)} t={t} />
                    <ItemActions item={featured} view={view} section={section} t={t} />
                  </span>
                </div>

                {rail.length > 0 ? (
                  <>
                    <h2 className="section-head">{t.watchlistAlsoInSection}</h2>
                    <TitleRail label={t.watchlistAlsoInSection} prevLabel={t.railPrev} nextLabel={t.railNext}>
                      {rail.map((item) => {
                        const hit = item.title;
                        const status = statusLine(item, t);
                        return (
                          <li key={`${hit.kind}-${hit.tmdbId}`}>
                            <div className="rail-card">
                              <Art path={hit.posterPath} />
                              <span className="name">{hit.name}</span>
                              <span className="sub">
                                {[hit.year, hit.kind === "movie" ? t.searchKindMovie : t.searchKindTv]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </span>
                              <span className={status.tone}>{status.text}</span>
                              <PublicRatingSlots ratings={ratingsFor(item)} t={t} compact />
                              <ItemActions item={item} view={view} section={section} t={t} />
                            </div>
                          </li>
                        );
                      })}
                    </TitleRail>
                  </>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      )}
    </main>
  );
}
