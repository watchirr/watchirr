"use client";

import { useEffect, useState } from "react";
import type { Messages } from "@/lib/locale";
import type { WatchlistSection, WatchlistView } from "@/lib/watchlist";
import { ActionDialog } from "./action-dialog";
import { loadSeriesSeasonsAction, removeSeasonsAction } from "./seasons-actions";

function desc(a: number, b: number): number {
  return b - a;
}

export function SeasonRemove({
  tmdbId,
  title,
  view,
  section,
  t,
}: {
  tmdbId: number;
  title: string;
  view: WatchlistView;
  section: WatchlistSection;
  t: Messages;
}) {
  const [monitored, setMonitored] = useState<number[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    // ponytail: one Sonarr lookup per In Library TV card so the button hides when nothing is monitored.
    // A batch list is the upgrade if the Watchlist grows past a handful of series.
    let alive = true;
    void loadSeriesSeasonsAction(tmdbId).then((result) => {
      if (!alive) return;
      setMonitored(result.ok ? result.monitored : []);
    });
    return () => {
      alive = false;
    };
  }, [tmdbId]);

  if (!monitored || monitored.length === 0) return null;

  const seasons = [...monitored].sort(desc);

  function toggle(n: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  return (
    <ActionDialog
      triggerLabel={t.watchlistSeasonRemove}
      title={t.watchlistSeasonRemoveConfirm}
      detail={title}
      cancelLabel={t.dialogCancel}
      confirmLabel={t.watchlistSeasonRemove}
      action={removeSeasonsAction}
      wide
    >
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <input type="hidden" name="view" value={view} />
      <input type="hidden" name="section" value={section} />
      <fieldset className="season-picker">
        <legend className="season-legend">{t.watchlistSeasonRemoveLabel}</legend>
        {picked.size === 0 ? <p className="season-hint">{t.watchlistSeasonRemoveHint}</p> : null}
        <ul className="season-list">
          {seasons.map((n) => {
            const on = picked.has(n);
            return (
              <li key={n}>
                <label className={on ? "season-row is-on" : "season-row"}>
                  <input
                    type="checkbox"
                    className="season-check"
                    name="seasons"
                    value={n}
                    checked={on}
                    onChange={() => toggle(n)}
                  />
                  <span className="season-label">{t.searchSeasonN.replace("{n}", String(n))}</span>
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <label className="keep-files">
        <input type="checkbox" name="keepFiles" value="1" className="season-check" />
        {t.watchlistKeepFiles}
      </label>
    </ActionDialog>
  );
}
