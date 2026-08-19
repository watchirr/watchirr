"use client";

import type { ArrLists } from "@/lib/connect";
import type { ArrSettings } from "@/lib/settings";
import type { TitleKind } from "@/lib/tmdb";
import type { WatchlistSection, WatchlistView } from "@/lib/watchlist";
import type { Messages } from "@/lib/locale";
import { ActionDialog } from "./action-dialog";
import { SeasonPicker } from "./season-picker";
import { keeperAcquireAction } from "./keeper-acquire-actions";

function withDefaultProfile(profiles: { id: number; name: string }[], id: number | null): { id: number; name: string }[] {
  if (!id || profiles.some((p) => p.id === id)) return profiles;
  return [...profiles, { id, name: `#${id}` }];
}

function withDefaultFolder(folders: { path: string }[], path: string): { path: string }[] {
  if (!path || folders.some((f) => f.path === path)) return folders;
  return [...folders, { path }];
}

export function KeeperAcquire({
  tmdbId,
  kind,
  view,
  section,
  title,
  t,
  radarr,
  radarrLists,
}: {
  tmdbId: number;
  kind: TitleKind;
  view: WatchlistView;
  section: WatchlistSection;
  title: string;
  t: Messages;
  radarr: ArrSettings;
  radarrLists: ArrLists;
}) {
  const radarrProfiles = withDefaultProfile(radarrLists.qualityProfiles, radarr.qualityProfileId);
  const radarrFolders = withDefaultFolder(radarrLists.rootFolders, radarr.rootFolder);

  return (
    <ActionDialog
      triggerLabel={t.watchlistKeeperAcquire}
      title={t.watchlistKeeperAcquireConfirm}
      detail={title}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.watchlistKeeperAcquire}
      action={keeperAcquireAction}
      wide
      lazy
    >
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="section" value={section} />
      {kind === "tv" ? (
        <SeasonPicker tmdbId={tmdbId} t={t} />
      ) : (
        <div className="acquire-fields">
          <label>
            <span className="sub">{t.qualityProfileLabel}</span>
            <select
              className="field"
              name="qualityProfileId"
              defaultValue={radarr.qualityProfileId ?? ""}
              required={radarrProfiles.length > 0}
            >
              {radarrProfiles.length === 0 ? <option value="">{t.chooseOption}</option> : null}
              {radarrProfiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sub">{t.rootFolderLabel}</span>
            <select className="field" name="rootFolder" defaultValue={radarr.rootFolder} required={radarrFolders.length > 0}>
              {radarrFolders.length === 0 ? <option value="">{t.chooseOption}</option> : null}
              {radarrFolders.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.path}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </ActionDialog>
  );
}

