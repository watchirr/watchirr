import Link from "next/link";
import { redirect } from "next/navigation";
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
} from "@/lib/tmdb";
import { listItems } from "@/lib/watchlist";
import { SearchHits } from "./hits";

export const dynamic = "force-dynamic";

function fail(t: Messages, error: SearchError): string {
  if (error === "missing-key") return t.searchNeedKey;
  const key =
    error === "unreachable" ? t.connectUnreachable : error === "unauthorized" ? t.connectUnauthorized : t.connectFailed;
  return key.replace("{service}", "TMDB");
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
  const key = (await getSettings(store)).tmdbApiKey;

  const cast = personId ? await personCast(key, personId, locale, kind) : null;
  const [titlesResult, peopleResult] = cast
    ? [null, null]
    : await Promise.all([searchTitles(key, q, locale, kind), q ? searchPeople(key, q, locale) : Promise.resolve(null)]);

  const error = !cast && titlesResult && !titlesResult.ok ? titlesResult.error : cast && !cast.ok ? cast.error : undefined;
  const titles = cast?.ok ? cast.titles : titlesResult?.ok ? titlesResult.titles : [];
  const people = peopleResult?.ok ? peopleResult.people : [];
  const person = cast?.ok ? cast.person : undefined;
  const ref = parseTitleRef(params.tmdb, params.kind);
  const selected = ref ? titles.find((hit) => hit.tmdbId === ref.tmdbId && hit.kind === ref.kind) : undefined;
  const onList = (await listItems(store)).map((i) => `${i.title.kind}:${i.title.tmdbId}`);
  const addError = params.err ? params.err : undefined;

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
              addError={addError}
              t={t}
            />
          </>
        ) : null}
      </section>
    </main>
  );
}
