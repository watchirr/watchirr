import Link from "next/link";
import { redirect } from "next/navigation";
import { access, currentLocale } from "@/lib/http";
import { messages } from "@/lib/locale";
import { posterUrl } from "@/lib/tmdb";
import { filterItems, listItems, parseWatchlistView } from "@/lib/watchlist";

export const dynamic = "force-dynamic";

function Art({ path }: { path: string | null }) {
  const src = posterUrl(path);
  return src ? <img className="art" src={src} alt="" /> : <div className="art" aria-hidden="true" />;
}

export default async function WatchlistPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const t = messages[await currentLocale()];
  const view = parseWatchlistView((await searchParams).view);
  const all = await listItems(store);
  const items = filterItems(all, view);

  const tabs = [
    { view: "all" as const, label: t.watchlistAll },
    { view: "covered" as const, label: t.watchlistCovered },
    { view: "acquire" as const, label: t.watchlistAcquire },
  ];

  return (
    <main className="main">
      <section className="panel glass wide">
        <h1 className="section-head">{t.navWatchlist}</h1>
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
                  const status = item.shouldAcquire
                    ? t.watchlistNeedsAcquire
                    : t.watchlistServices.replace(
                        "{services}",
                        item.services.map((s) => s.name).join(", "),
                      );
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
                          <span className={item.shouldAcquire ? "sub warn" : "sub ok"}>{status}</span>
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
