"use client";

import type { Messages } from "@/lib/locale";
import { ActionDialog } from "./action-dialog";
import { SeasonPicker } from "./season-picker";
import { expandSeasonsAction } from "./seasons-actions";

export function ExpandSeasons({
  tmdbId,
  title,
  t,
}: {
  tmdbId: number;
  title: string;
  t: Messages;
}) {
  return (
    <ActionDialog
      triggerLabel={t.watchlistExpandSeasons}
      title={t.watchlistExpandConfirm}
      detail={title}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.watchlistExpandSeasons}
      action={expandSeasonsAction}
      wide
      lazy
    >
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <SeasonPicker tmdbId={tmdbId} t={t} expandOnly />
    </ActionDialog>
  );
}
