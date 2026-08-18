"use client";

import type { Messages } from "@/lib/locale";
import type { TitleKind } from "@/lib/tmdb";
import { ActionDialog } from "./action-dialog";
import { removeItemAction } from "./remove-actions";

export function RemoveItem({
  tmdbId,
  kind,
  view,
  section,
  title,
  canKeepFiles,
  t,
}: {
  tmdbId: number;
  kind: TitleKind;
  view: string;
  section: string;
  title: string;
  canKeepFiles: boolean;
  t: Messages;
}) {
  return (
    <ActionDialog
      triggerLabel={t.watchlistRemove}
      title={t.watchlistRemoveConfirm}
      detail={title}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.watchlistRemove}
      action={removeItemAction}
    >
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="section" value={section} />
      {canKeepFiles ? (
        <label className="keep-files">
          <input type="checkbox" name="keepFiles" value="1" className="season-check" />
          {t.watchlistKeepFiles}
        </label>
      ) : null}
    </ActionDialog>
  );
}
