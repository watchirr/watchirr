"use client";

import { useActionState } from "react";
import type { Messages } from "@/lib/locale";
import type { HouseholdState } from "./actions";

function fail(t: Messages, service: string, code: HouseholdState["errors"][keyof HouseholdState["errors"]]) {
  if (!code) return null;
  const key = code === "unreachable" ? t.connectUnreachable : code === "unauthorized" ? t.connectUnauthorized : t.connectFailed;
  return key.replace("{service}", service);
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
  const showCountry = state.tmdbReady && state.countries.length > 0;
  const showServices = state.providers.length > 0;

  return (
    <form action={formAction} key={state.stamp} aria-busy={pending}>
      {state.saved ? <p className="ok">{t.settingsSaved}</p> : null}

      <fieldset className="block">
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
          <>
            <p className="hint">{t.paidServicesHint}</p>
            <div className="checks">
              {state.providers.map((p) => (
                <label key={p.id}>
                  <input
                    type="checkbox"
                    name="paidServiceIds"
                    value={p.id}
                    defaultChecked={settings.paidServiceIds.includes(p.id)}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          </>
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
      </fieldset>

      <fieldset className="block">
        <legend>{t.sonarrSection}</legend>
        <label htmlFor="sonarrUrl">{t.urlLabel}</label>
        <input id="sonarrUrl" name="sonarrUrl" className="field" defaultValue={settings.sonarr.url} placeholder="http://sonarr:8989" />
        <label htmlFor="sonarrApiKey">{t.apiKeyLabel}</label>
        <input id="sonarrApiKey" name="sonarrApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.sonarr.apiKey} />
        {sonarrErr ? <p className="error">{sonarrErr}</p> : null}
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
      </fieldset>

      <fieldset className="block">
        <legend>{t.jellyfinSection}</legend>
        <label htmlFor="jellyfinUrl">{t.urlLabel}</label>
        <input id="jellyfinUrl" name="jellyfinUrl" className="field" defaultValue={settings.jellyfin.url} placeholder="http://jellyfin:8096" />
        <label htmlFor="jellyfinApiKey">{t.apiKeyLabel}</label>
        <input id="jellyfinApiKey" name="jellyfinApiKey" className="field" type="password" autoComplete="off" defaultValue={settings.jellyfin.apiKey} />
        {jellyErr ? <p className="error">{jellyErr}</p> : null}
      </fieldset>

      <div className="actions">
        <button className="btn narrow" type="submit" name="intent" value="save" disabled={pending}>
          {t.saveSettings}
        </button>
      </div>
    </form>
  );
}
