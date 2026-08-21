import Link from "next/link";
import { redirect } from "next/navigation";
import { OutcomeToast } from "../../toast-host";
import { probeArr } from "@/lib/connect";
import { DISCOVER_RAILS, discoverCatalog, type DiscoverRailId } from "@/lib/discover";
import { access, currentLocale, currentTitleKind } from "@/lib/http";
import { messages, type Messages } from "@/lib/locale";
import { getSettings, num, str } from "@/lib/settings";
import {
  parseTitleRef,
  personCast,
  posterUrl,
  searchPeople,
  searchTitles,
  type Person,
  type SearchError,
  type Title,
} from "@/lib/tmdb";
import { listItems } from "@/lib/watchlist";
import { DiscoverRails, SearchHits } from "./hits";

export const dynamic = "force-dynamic";

function fail(t: Messages, error: SearchError): string {
  if (error === "missing-key") return t.searchNeedKey;
  const key =
    error === "unreachable" ? t.connectUnreachable : error === "unauthorized" ? t.connectUnauthorized : t.connectFailed;
  return key.replace("{service}", "TMDB");
}

function addFail(t: Messages, error: string, kind?: string): string {
  const service = kind === "tv" ? "Sonarr" : "Radarr";
  if (error === "missing-defaults") return t.searchAddMissingDefaults;
  if (error === "missing-tvdb") return t.searchAddMissingTvdb;
  if (error === "missing-seasons") return t.searchAddMissingSeasons;
  if (error === "not-found") return t.searchAddNotFound.replace("{service}", service);
  if (error === "arr-unauthorized") return t.searchAddArrUnauthorized.replace("{service}", service);
  if (error === "arr-unreachable" || error === "arr-failed") {
    return t.searchAddArrFailed.replace("{service}", service);
  }
  return t.searchAddFailed;
}

function Art({ path, round }: { path: string | null; round?: boolean }) {
  const src = posterUrl(path);
  const cls = round ? "art round" : "art";
  return src ? <img className={cls} src={src} alt="" /> : <div className={cls} aria-hidden="true" />;
}

function personHref(q: string, person: Person): string {
  return `/search?${new URLSearchParams({ q, person: String(person.tmdbId) })}`;
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tmdb?: string; kind?: string; person?: string; err?: string }>;
}) {
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const locale = await currentLocale();
  const t = messages[locale];
  const kind = await currentTitleKind();
  const params = await searchParams;
  const q = str(params.q);
  const personId = num(params.person);
  const settings = await getSettings(store);
  const key = settings.tmdbApiKey;
  const discoverHome = !q && !personId;

  const cast = personId ? await personCast(key, personId, locale, kind) : null;
  const [titlesResult, peopleResult, radarrProbe, sonarrProbe, catalog] = cast
    ? await Promise.all([
        Promise.resolve(null),
        Promise.resolve(null),
        probeArr("radarr", settings.radarr.url, settings.radarr.apiKey),
        probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey),
        Promise.resolve(null),
      ])
    : await Promise.all([
        discoverHome ? Promise.resolve(null) : searchTitles(key, q, locale, kind),
        q ? searchPeople(key, q, locale) : Promise.resolve(null),
        probeArr("radarr", settings.radarr.url, settings.radarr.apiKey),
        probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey),
        discoverHome
          ? Promise.all(
              DISCOVER_RAILS.map((rail) =>
                discoverCatalog({
                  apiKey: key,
                  language: locale,
                  filter: kind,
                  country: settings.country,
                  rail,
                  page: 1,
                }),
              ),
            )
          : Promise.resolve(null),
      ]);

  const failedRail = catalog?.find((row) => !row.ok);
  const discoverError = failedRail && !failedRail.ok ? failedRail.error : undefined;
  const discoverRails: { id: DiscoverRailId; titles: Title[] }[] =
    catalog && !discoverError
      ? DISCOVER_RAILS.map((id, i) => ({ id, titles: catalog[i]!.ok ? catalog[i]!.titles : [] }))
      : [];
  const error =
    discoverError ??
    (!cast && titlesResult && !titlesResult.ok ? titlesResult.error : cast && !cast.ok ? cast.error : undefined);
  const titles = cast?.ok ? cast.titles : titlesResult?.ok ? titlesResult.titles : [];
  const people = peopleResult?.ok ? peopleResult.people : [];
  const person = cast?.ok ? cast.person : undefined;
  const ref = parseTitleRef(params.tmdb, params.kind);
  const pool = discoverHome ? discoverRails.flatMap((rail) => rail.titles) : titles;
  const selected = ref ? pool.find((hit) => hit.tmdbId === ref.tmdbId && hit.kind === ref.kind) : undefined;
  const onList = (await listItems(store)).map((i) => `${i.title.kind}:${i.title.tmdbId}`);
  const addError = params.err ? addFail(t, params.err, params.kind) : undefined;
  const blankLists = { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null };
  const radarrLists = radarrProbe.ok && !radarrProbe.skipped ? radarrProbe.data : blankLists;
  const sonarrLists = sonarrProbe.ok && !sonarrProbe.skipped ? sonarrProbe.data : blankLists;

  return (
    <main className="main">
      {addError ? <OutcomeToast type="error" message={addError} clearParam="err" /> : null}
      <section className="panel glass wide">
        {error ? (
          <p className="error">
            {fail(t, error)}
            {error === "missing-key" ? (
              <>
                {" "}
                <Link href="/settings">{t.navSettings}</Link>
              </>
            ) : null}
          </p>
        ) : null}
        {person ? (
          <div className="hit hero">
            <Art path={person.profilePath} round />
            <div className="meta">
              <p className="section-head extra">{t.searchPeople}</p>
              <p className="name">{person.name}</p>
              {person.department ? <p className="sub">{person.department}</p> : null}
              <Link className="sub" href={`/search?${new URLSearchParams({ q })}`}>
                {t.searchBack}
              </Link>
            </div>
          </div>
        ) : null}
        {people.length > 0 ? (
          <>
            <h2 className="section-head">{t.searchPeople}</h2>
            <ul className="cast-rail" aria-label={t.searchPeople}>
              {people.map((p) => (
                <li key={`person-${p.tmdbId}`}>
                  <Link className="cast-rail-item" href={personHref(q, p)}>
                    <Art path={p.profilePath} round />
                    <span className="name">{p.department || t.searchKindPerson}</span>
                    <span className="sub">{p.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {!error && discoverHome ? (
          <DiscoverRails
            rails={discoverRails}
            selected={selected}
            onList={onList}
            t={t}
            radarr={settings.radarr}
            sonarr={settings.sonarr}
            radarrLists={radarrLists}
            sonarrLists={sonarrLists}
          />
        ) : null}
        {!error && q && !person && titles.length === 0 && people.length === 0 ? <p className="muted">{t.searchEmpty}</p> : null}
        {!error && person && titles.length === 0 ? <p className="muted">{t.searchCastEmpty}</p> : null}
        {titles.length > 0 ? (
          <>
            {people.length > 0 ? <h2 className="section-head">{t.searchTitlesHead}</h2> : null}
            <SearchHits
              titles={titles}
              q={q}
              personId={personId ?? undefined}
              selected={selected}
              onList={onList}
              t={t}
              radarr={settings.radarr}
              sonarr={settings.sonarr}
              radarrLists={radarrLists}
              sonarrLists={sonarrLists}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
