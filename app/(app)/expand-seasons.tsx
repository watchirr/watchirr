"use client";

import { useState } from "react";
import type { Messages } from "@/lib/locale";
import { SeasonPicker } from "./season-picker";
import { expandSeasonsAction } from "./seasons-actions";

export function ExpandSeasons({ tmdbId, t }: { tmdbId: number; t: Messages }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className="season-open" onClick={() => setOpen(true)}>
        {t.watchlistExpandSeasons}
      </button>
    );
  }
  return (
    <form action={expandSeasonsAction} className="expand-form">
      <input type="hidden" name="tmdbId" value={tmdbId} />
      <SeasonPicker tmdbId={tmdbId} t={t} expandOnly />
      <div className="season-submit-row">
        <button type="button" className="season-chip" onClick={() => setOpen(false)}>
          {t.searchBack}
        </button>
        <button type="submit" className="add-btn">
          {t.watchlistExpandSeasons}
        </button>
      </div>
    </form>
  );
}
