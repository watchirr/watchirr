import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpandSeasons } from "./expand-seasons";
import { MarkWatched } from "./mark-watched";
import { RemoveItem } from "./remove-item";
import { access, currentLocale } from "@/lib/http";
import { jellyfinProgress } from "@/lib/jellyfin";
import { messages, type Messages } from "@/lib/locale";
import { getSettings } from "@/lib/settings";
import { posterUrl } from "@/lib/tmdb";
import { filterItems, listItems, parseWatchlistView, syncJellyfinWatched } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

function Art({ path }: { path: string | null }) {
  const src = posterUrl(path);
  return src ? <img className="art" src={src} alt="" /> : <div className="art" aria-hidden="true" />;
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

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; err?: string }>;
}) {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const t = messages[await currentLocale()];
  const params = await searchParams;
  const view = parseWatchlistView(params.view);

  // Simple poll on list load (ADR 0004 / ticket 07) — no webhook.
  const settings = await getSettings(store);
  await syncJellyfinWatched(store, { progress: jellyfinProgress(settings) });

  const all = await listItems(store);
  const items = filterItems(all, view);
  const arrError = params.err ? arrFail(t, params.err) : undefined;

  const tabs = [
    { view: "all" as const, label: t.watchlistAll },
    { view: "covered" as const, label: t.watchlistCovered },
    { view: "acquire" as const, label: t.watchlistAcquire },
    { view: "watched" as const, label: t.watchlistWatched },
  ];

  return (
    <main className="main">
      <section className="panel glass wide">
        <h1 className="section-head">{t.navWatchlist}</h1>
        {arrError ? <p className="error">{arrError}</p> : null}
        {all.length === 0 ? (
          <p className="muted">{t.watchlistEmpty}</p>
        ) : (
          <>
            <nav className="lens" aria-label={t.watchlistFilter}>
              {tabs.map((tab) => (
                <Link
                  key={tab.view}
                  href={tab.view === "all" ? "/" : `/?view=${tab.view}`}
                  className={view === tab.view ? "on" : undefined}
                  aria-current={view === tab.view ? "page" : undefined}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>
            {items.length === 0 ? (
              <p className="muted">{t.watchlistNoneMatch}</p>
            ) : (
              <ul className="hits watchlist-hits">
                {items.map((item) => {
                  const hit = item.title;
                  const status = item.watched
                    ? t.watchlistWatched
                    : item.inLibrary
                      ? t.watchlistInLibrary
                      : item.shouldAcquire
                        ? t.watchlistNeedsAcquire
                        : t.watchlistServices.replace(
                            "{services}",
                            item.services.map((s) => s.name).join(", "),
                          );
                  const tone = item.shouldAcquire && !item.watched ? "sub tone-warn" : "sub tone-ok";
                  return (
                    <li key={`${hit.kind}-${hit.tmdbId}`}>
                      <div className="hit">
                        <Art path={hit.posterPath} />
                        <span className="meta">
                          <span className="name">{hit.name}</span>
                          <span className="sub">
                            {[hit.year, hit.kind === "movie" ? t.searchKindMovie : t.searchKindTv]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          <span className={tone}>{status}</span>
                          {item.inLibrary && hit.kind === "tv" && !item.watched ? (
                            <ExpandSeasons tmdbId={hit.tmdbId} title={hit.name} t={t} />
                          ) : null}
                          <div className="item-actions">
                            {!item.watched ? (
                              <MarkWatched
                                tmdbId={hit.tmdbId}
                                kind={hit.kind}
                                view={view}
                                title={hit.name}
                                t={t}
                              />
                            ) : null}
                            <RemoveItem
                              tmdbId={hit.tmdbId}
                              kind={hit.kind}
                              view={view}
                              title={hit.name}
                              canKeepFiles={item.inLibrary || item.shouldAcquire}
                              t={t}
                            />
                          </div>
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </section>
    </main>
  );
}
