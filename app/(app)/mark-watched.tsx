"use client";

import type { Messages } from "@/lib/locale";
import type { TitleKind } from "@/lib/tmdb";
import { ActionDialog } from "./action-dialog";
import { markWatchedAction } from "./watched-actions";

export function MarkWatched({
  tmdbId,
  kind,
  view,
  title,
  t,
}: {
  tmdbId: number;
  kind: TitleKind;
  view: string;
  title: string;
  t: Messages;
}) {
  return (
    <ActionDialog
      triggerLabel={t.watchlistMarkWatched}
      title={t.watchlistMarkWatchedConfirm}
      detail={title}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.watchlistMarkWatched}
      action={markWatchedAction}
    >
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="view" value={view} />
    </ActionDialog>
  );
}
