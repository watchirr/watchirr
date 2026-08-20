"use client";

import { useActionState, useState } from "react";
import type { Messages } from "@/lib/locale";
import type { ArrError } from "@/lib/arr";
import type { JellyfinError } from "@/lib/jellyfin";
import type { HouseholdState } from "./actions";

function fail(t: Messages, service: string, code: HouseholdState["errors"][keyof HouseholdState["errors"]]) {
  if (!code) return null;
  const key = code === "unreachable" ? t.connectUnreachable : code === "unauthorized" ? t.connectUnauthorized : t.connectFailed;
  return key.replace("{service}", service);
}

function arrFail(t: Messages, service: string, code: ArrError): string {
  if (code === "missing-defaults") return t.libraryImportMissing.replace("{service}", service);
  if (code === "arr-unreachable") return t.connectUnreachable.replace("{service}", service);
  if (code === "arr-unauthorized") return t.connectUnauthorized.replace("{service}", service);
  return t.connectFailed.replace("{service}", service);
}

function jellyFail(t: Messages, code: JellyfinError | "missing-defaults"): string {
  if (code === "missing-defaults") return t.libraryImportMissing.replace("{service}", "Jellyfin");
  if (code === "jellyfin-unreachable") return t.connectUnreachable.replace("{service}", "Jellyfin");
  if (code === "jellyfin-unauthorized") return t.connectUnauthorized.replace("{service}", "Jellyfin");
  return t.connectFailed.replace("{service}", "Jellyfin");
}

function withSaved<T extends { id?: number; path?: string }>(items: T[], saved: T, key: keyof T): T[] {
  if (saved[key] == null || saved[key] === "") return items;
  if (items.some((item) => item[key] === saved[key])) return items;
  return [saved, ...items];
}

function keep(name: string, value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  return <input type="hidden" name={name} value={value} />;
}

function PaidServices({
  providers,
  selected,
  hint,
  filterLabel,
  filterEmpty,
}: {
  providers: { id: number; name: string }[];
  selected: number[];
  hint: string;
  filterLabel: string;
  filterEmpty: string;
}) {
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() => new Set(selected));
  const needle = q.trim().toLowerCase();
  const visible = needle
    ? providers.filter((p) => p.name.toLowerCase().includes(needle))
    : providers;
  const offscreen = [...picked].filter((id) => !visible.some((p) => p.id === id));

  function toggle(id: number, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <>
      <p className="hint">{hint}</p>
      <label className="sr-only" htmlFor="paid-service-filter">
        {filterLabel}
      </label>
      <input
        id="paid-service-filter"
        className="field paid-filter"
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
        placeholder={filterLabel}
        autoComplete="off"
      />
      <div className="checks">
        {visible.length === 0 ? <p className="muted">{filterEmpty}</p> : null}
        {visible.map((p) => (
          <label key={p.id}>
            <input
              type="checkbox"
              name="paidServiceIds"
              value={p.id}
              checked={picked.has(p.id)}
              onChange={(e) => toggle(p.id, e.target.checked)}
            />
            {p.name}
          </label>
        ))}
      </div>
      {offscreen.map((id) => (
        <input key={`keep-${id}`} type="hidden" name="paidServiceIds" value={id} />
      ))}
    </>
  );
}

function ArrPicks({
  ready,
  folderName,
  profileName,
  langName,
  folders,
  profiles,
  langs,
  folder,
  profileId,
  langId,
  t,
}: {
  ready: boolean;
  folderName: string;
  profileName: string;
  langName?: string;
  folders: { path: string }[];
  profiles: { id: number; name: string }[];
  langs?: { id: number; name: string }[] | null;
  folder: string;
  profileId: number | null;
  langId?: number | null;
  t: Messages;
}) {
  const folderOpts = withSaved(folders, { path: folder }, "path").filter((f) => f.path);
  const profileOpts = withSaved(profiles, { id: profileId ?? 0, name: `#${profileId}` }, "id").filter((p) => p.id);
  const langOpts =
    langs && langName
      ? withSaved(langs, { id: langId ?? 0, name: `#${langId}` }, "id").filter((p) => p.id)
      : null;

  if (!ready) {
    return (
      <>
        {keep(folderName, folder)}
        {keep(profileName, profileId)}
        {langName ? keep(langName, langId) : null}
      </>
    );
  }

  return (
    <>
      <label htmlFor={folderName}>{t.rootFolderLabel}</label>
      <select id={folderName} name={folderName} className="field" defaultValue={folder}>
        <option value="">{t.chooseOption}</option>
        {folderOpts.map((f) => (
          <option key={f.path} value={f.path}>
            {f.path}
          </option>
        ))}
      </select>
      <label htmlFor={profileName}>{t.qualityProfileLabel}</label>
      <select id={profileName} name={profileName} className="field" defaultValue={profileId ?? ""}>
        <option value="">{t.chooseOption}</option>
        {profileOpts.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {langName && langOpts ? (
        <>
          <label htmlFor={langName}>{t.languageProfileLabel}</label>
          <select id={langName} name={langName} className="field" defaultValue={langId ?? ""}>
            <option value="">{t.chooseOption}</option>
            {langOpts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </>
      ) : langName ? (
        keep(langName, langId)
      ) : null}
    </>
  );
}

export function HouseholdForm({
  action,
  initial,
  t,
}: {
  action: (prev: HouseholdState, formData: FormData) => Promise<HouseholdState>;
  initial: HouseholdState;
  t: Messages;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const { settings, errors } = state;
  const tmdbErr = fail(t, "TMDB", errors.tmdb);
  const radarrErr = fail(t, "Radarr", errors.radarr);
  const sonarrErr = fail(t, "Sonarr", errors.sonarr);
  const jellyErr = fail(t, "Jellyfin", errors.jellyfin);
  const radarrImportErr =
    state.radarrImport && !state.radarrImport.ok ? arrFail(t, "Radarr", state.radarrImport.error) : null;
  const sonarrImportErr =
    state.sonarrImport && !state.sonarrImport.ok ? arrFail(t, "Sonarr", state.sonarrImport.error) : null;
  const jellyImportErr =
    state.jellyfinImport && !state.jellyfinImport.ok ? jellyFail(t, state.jellyfinImport.error) : null;
  const showCountry = state.tmdbReady && state.countries.length > 0;
  const showServices = state.providers.length > 0;

  return (
    <form className="settings-form" action={formAction} key={state.stamp} aria-busy={pending}>
      {state.saved ? <p className="ok">{t.settingsSaved}</p> : null}
      {state.radarrImport?.ok ? (
        <p className="ok">
          {t.libraryImportOk
            .replace("{added}", String(state.radarrImport.added))
            .replace("{already}", String(state.radarrImport.alreadyOnList))
            .replace("{skipped}", String(state.radarrImport.skippedNoTmdb))}
        </p>
      ) : null}
      {state.sonarrImport?.ok ? (
        <p className="ok">
          {t.libraryImportOk
            .replace("{added}", String(state.sonarrImport.added))
            .replace("{already}", String(state.sonarrImport.alreadyOnList))
            .replace("{skipped}", String(state.sonarrImport.skippedNoTmdb))}
        </p>
      ) : null}
      {state.jellyfinImport?.ok ? (
        <p className="ok">
          {t.watchedImportOk
            .replace("{marked}", String(state.jellyfinImport.marked))
            .replace("{already}", String(state.jellyfinImport.alreadyWatched))
            .replace("{noMatch}", String(state.jellyfinImport.noMatch))}
        </p>
      ) : null}

      <fieldset className="block span-all">
        <legend>{t.tmdbSection}</legend>
        <label htmlFor="tmdbApiKey">{t.apiKeyLabel}</label>
        <input id="tmdbApiKey" name="tmdbApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.tmdbApiKey} />
        {tmdbErr ? <p className="error">{tmdbErr}</p> : null}
        <button className="btn secondary" type="submit" name="intent" value="probe-tmdb" disabled={pending}>
          {t.loadTmdb}
        </button>
        {showCountry ? (
          <>
            <label htmlFor="country">{t.countryLabel}</label>
            <select
              id="country"
              name="country"
              className="field"
              defaultValue={settings.country}
              onChange={(event) => {
                const form = event.currentTarget.form;
                const btn = form?.querySelector<HTMLButtonElement>('button[value="probe-tmdb"]');
                if (form && btn) form.requestSubmit(btn);
              }}
            >
              <option value="">{t.chooseOption}</option>
              {settings.country && !state.countries.some((c) => c.code === settings.country) ? (
                <option value={settings.country}>{settings.country}</option>
              ) : null}
              {state.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </>
        ) : (
          keep("country", settings.country)
        )}
        {showServices ? (
          <PaidServices
            providers={state.providers}
            selected={settings.paidServiceIds}
            hint={t.paidServicesHint}
            filterLabel={t.paidServicesFilter}
            filterEmpty={t.paidServicesFilterEmpty}
          />
        ) : (
          settings.paidServiceIds.map((id) => (
            <input key={id} type="hidden" name="paidServiceIds" value={id} />
          ))
        )}
      </fieldset>

      <fieldset className="block">
        <legend>{t.radarrSection}</legend>
        <label htmlFor="radarrUrl">{t.urlLabel}</label>
        <input id="radarrUrl" name="radarrUrl" className="field" defaultValue={settings.radarr.url} placeholder="http://radarr:7878" />
        <label htmlFor="radarrApiKey">{t.apiKeyLabel}</label>
        <input id="radarrApiKey" name="radarrApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.radarr.apiKey} />
        {radarrErr ? <p className="error">{radarrErr}</p> : null}
        {radarrImportErr ? <p className="error">{radarrImportErr}</p> : null}
        <button className="btn secondary" type="submit" name="intent" value="probe-radarr" disabled={pending}>
          {t.loadRadarr}
        </button>
        <ArrPicks
          ready={state.radarr.ready}
          folderName="radarrRootFolder"
          profileName="radarrQualityProfileId"
          folders={state.radarr.rootFolders}
          profiles={state.radarr.qualityProfiles}
          folder={settings.radarr.rootFolder}
          profileId={settings.radarr.qualityProfileId}
          t={t}
        />
        <button className="btn secondary" type="submit" name="intent" value="import-radarr-library" disabled={pending}>
          {t.importToWatchlist}
        </button>
      </fieldset>

      <fieldset className="block">
        <legend>{t.sonarrSection}</legend>
        <label htmlFor="sonarrUrl">{t.urlLabel}</label>
        <input id="sonarrUrl" name="sonarrUrl" className="field" defaultValue={settings.sonarr.url} placeholder="http://sonarr:8989" />
        <label htmlFor="sonarrApiKey">{t.apiKeyLabel}</label>
        <input id="sonarrApiKey" name="sonarrApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.sonarr.apiKey} />
        {sonarrErr ? <p className="error">{sonarrErr}</p> : null}
        {sonarrImportErr ? <p className="error">{sonarrImportErr}</p> : null}
        <button className="btn secondary" type="submit" name="intent" value="probe-sonarr" disabled={pending}>
          {t.loadSonarr}
        </button>
        <ArrPicks
          ready={state.sonarr.ready}
          folderName="sonarrRootFolder"
          profileName="sonarrQualityProfileId"
          langName="sonarrLanguageProfileId"
          folders={state.sonarr.rootFolders}
          profiles={state.sonarr.qualityProfiles}
          langs={state.sonarr.languageProfiles}
          folder={settings.sonarr.rootFolder}
          profileId={settings.sonarr.qualityProfileId}
          langId={settings.sonarr.languageProfileId}
          t={t}
        />
        <button className="btn secondary" type="submit" name="intent" value="import-sonarr-library" disabled={pending}>
          {t.importToWatchlist}
        </button>
      </fieldset>

      <fieldset className="block">
        <legend>{t.jellyfinSection}</legend>
        <label htmlFor="jellyfinUrl">{t.urlLabel}</label>
        <input id="jellyfinUrl" name="jellyfinUrl" className="field" defaultValue={settings.jellyfin.url} placeholder="http://jellyfin:8096" />
        <label htmlFor="jellyfinApiKey">{t.apiKeyLabel}</label>
        <input id="jellyfinApiKey" name="jellyfinApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.jellyfin.apiKey} />
        {jellyErr ? <p className="error">{jellyErr}</p> : null}
        {jellyImportErr ? <p className="error">{jellyImportErr}</p> : null}
        <button className="btn secondary" type="submit" name="intent" value="import-jellyfin-watched" disabled={pending}>
          {t.importWatched}
        </button>
      </fieldset>

      <fieldset className="block">
        <legend>{t.omdbSection}</legend>
        <p className="hint">{t.omdbHint}</p>
        <label htmlFor="omdbApiKey">{t.apiKeyLabel}</label>
        <input
          id="omdbApiKey"
          name="omdbApiKey"
          className="field"
          type="password"
          autoComplete="off"
          defaultValue={settings.omdbApiKey}
        />
      </fieldset>

      <div className="actions span-all">
        <button className="btn narrow" type="submit" name="intent" value="save" disabled={pending}>
          {t.saveSettings}
        </button>
      </div>
    </form>
  );
}
