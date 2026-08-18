import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { probeArr } from "@/lib/connect";
import { discoverCatalog, isDiscoverRailId } from "@/lib/discover";
import { access, currentLocale, currentTitleKind } from "@/lib/http";
import { messages, type Messages } from "@/lib/locale";
import { getSettings, num, str } from "@/lib/settings";
import { parseTitleRef, type SearchError } from "@/lib/tmdb";
import { listItems } from "@/lib/watchlist";
import { DiscoverList } from "../hits";

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

export default async function DiscoverListPage({
  params,
  searchParams,
}: {
  params: Promise<{ rail: string }>;
  searchParams: Promise<{ q?: string; page?: string; tmdb?: string; kind?: string; err?: string }>;
}) {
  const { rail: railParam } = await params;
  if (!isDiscoverRailId(railParam)) notFound();

  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");

  const query = await searchParams;
  const q = str(query.q);
  if (q) redirect(`/search?${new URLSearchParams({ q })}`);

  const locale = await currentLocale();
  const t = messages[locale];
  const kind = await currentTitleKind();
  const settings = await getSettings(store);
  const page = num(query.page) ?? 1;
  const blankLists = { ready: false, qualityProfiles: [], rootFolders: [], languageProfiles: null };

  const [catalog, radarrProbe, sonarrProbe] = await Promise.all([
    discoverCatalog({
      apiKey: settings.tmdbApiKey,
      language: locale,
      filter: kind,
      country: settings.country,
      rail: railParam,
      page,
    }),
    probeArr("radarr", settings.radarr.url, settings.radarr.apiKey),
    probeArr("sonarr", settings.sonarr.url, settings.sonarr.apiKey),
  ]);

  const error = catalog.ok ? undefined : catalog.error;
  const titles = catalog.ok ? catalog.titles : [];
  const hasNext = catalog.ok ? catalog.hasNext : false;
  const ref = parseTitleRef(query.tmdb, query.kind);
  const selected = ref ? titles.find((hit) => hit.tmdbId === ref.tmdbId && hit.kind === ref.kind) : undefined;
  const onList = (await listItems(store)).map((i) => `${i.title.kind}:${i.title.tmdbId}`);
  const addError = query.err ? addFail(t, query.err, query.kind) : undefined;
  const radarrLists = radarrProbe.ok && !radarrProbe.skipped ? radarrProbe.data : blankLists;
  const sonarrLists = sonarrProbe.ok && !sonarrProbe.skipped ? sonarrProbe.data : blankLists;

  return (
    <main className="main">
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
        ) : (
          <DiscoverList
            key={`${railParam}:${page}:${kind}`}
            rail={railParam}
            titles={titles}
            page={page}
            hasNext={hasNext}
            selected={selected}
            onList={onList}
            addError={addError}
            t={t}
            radarr={settings.radarr}
            sonarr={settings.sonarr}
            radarrLists={radarrLists}
            sonarrLists={sonarrLists}
          />
        )}
      </section>
    </main>
  );
}
