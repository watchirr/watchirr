"use client";

import type { ArrLists, NamedId } from "@/lib/connect";
import type { DiscoverRailId } from "@/lib/discover";
import type { Messages } from "@/lib/locale";
import type { ArrSettings } from "@/lib/settings";
import type { Title } from "@/lib/tmdb";
import { ActionDialog } from "../action-dialog";
import { SeasonPicker } from "../season-picker";
import { addWatchlistAction } from "./actions";

function withDefaultProfile(profiles: NamedId[], id: number | null): NamedId[] {
  if (!id || profiles.some((p) => p.id === id)) return profiles;
  return [...profiles, { id, name: `#${id}` }];
}

function withDefaultFolder(folders: { path: string }[], path: string): { path: string }[] {
  if (!path || folders.some((f) => f.path === path)) return folders;
  return [...folders, { path }];
}

function AcquireFields({
  hit,
  t,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
}: {
  hit: Title;
  t: Messages;
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  radarrLists: ArrLists;
  sonarrLists: ArrLists;
}) {
  const arr = hit.kind === "movie" ? radarr : sonarr;
  const lists = hit.kind === "movie" ? radarrLists : sonarrLists;
  const profiles = withDefaultProfile(lists.qualityProfiles, arr.qualityProfileId);
  const folders = withDefaultFolder(lists.rootFolders, arr.rootFolder);
  return (
    <div className="acquire-fields">
      <label>
        <span className="sub">{t.qualityProfileLabel}</span>
        <select
          className="field"
          name="qualityProfileId"
          defaultValue={arr.qualityProfileId ?? ""}
          required={profiles.length > 0}
        >
          {profiles.length === 0 ? <option value="">{t.chooseOption}</option> : null}
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="sub">{t.rootFolderLabel}</span>
        <select className="field" name="rootFolder" defaultValue={arr.rootFolder} required={folders.length > 0}>
          {folders.length === 0 ? <option value="">{t.chooseOption}</option> : null}
          {folders.map((f) => (
            <option key={f.path} value={f.path}>
              {f.path}
            </option>
          ))}
        </select>
      </label>
      {hit.kind === "tv" ? <SeasonPicker tmdbId={hit.tmdbId} t={t} /> : null}
    </div>
  );
}

export function AddWatchlist({
  hit,
  q,
  personId,
  fromList,
  t,
  radarr,
  sonarr,
  radarrLists,
  sonarrLists,
}: {
  hit: Title;
  q: string;
  personId?: number;
  fromList?: { rail: DiscoverRailId; page: number };
  t: Messages;
  radarr: ArrSettings;
  sonarr: ArrSettings & { languageProfileId: number | null };
  radarrLists: ArrLists;
  sonarrLists: ArrLists;
}) {
  return (
    <ActionDialog
      triggerLabel={t.searchAdd}
      triggerClassName="add-btn"
      title={t.searchAddConfirm}
      detail={hit.name}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.searchAdd}
      action={addWatchlistAction}
      wide
      lazy
    >
      <input type="hidden" name="tmdbId" value={hit.tmdbId} />
      <input type="hidden" name="kind" value={hit.kind} />
      <input type="hidden" name="name" value={hit.name} />
      <input type="hidden" name="year" value={hit.year ?? ""} />
      <input type="hidden" name="posterPath" value={hit.posterPath ?? ""} />
      <input type="hidden" name="q" value={q} />
      {personId ? <input type="hidden" name="person" value={personId} /> : null}
      {fromList ? (
        <>
          <input type="hidden" name="rail" value={fromList.rail} />
          <input type="hidden" name="page" value={String(fromList.page)} />
        </>
      ) : null}
      <AcquireFields
        hit={hit}
        t={t}
        radarr={radarr}
        sonarr={sonarr}
        radarrLists={radarrLists}
        sonarrLists={sonarrLists}
      />
    </ActionDialog>
  );
}
