"use client";

import { useEffect, useState } from "react";
import type { Messages } from "@/lib/locale";
import { loadSeriesSeasonsAction } from "./seasons-actions";

function desc(a: number, b: number): number {
  return b - a;
}

export function SeasonPicker({
  tmdbId,
  t,
  expandOnly = false,
}: {
  tmdbId: number;
  t: Messages;
  expandOnly?: boolean;
}) {
  const [seasons, setSeasons] = useState<number[]>([]);
  const [monitored, setMonitored] = useState<Set<number>>(() => new Set());
  const [picked, setPicked] = useState<Set<number>>(() => new Set());
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [inLibrary, setInLibrary] = useState(false);

  useEffect(() => {
    let alive = true;
    setStatus("loading");
    setPicked(new Set());
    setSeasons([]);
    setMonitored(new Set());
    void loadSeriesSeasonsAction(tmdbId).then((result) => {
      if (!alive) return;
      if (!result.ok) {
        setStatus("error");
        return;
      }
      setSeasons([...result.seasons].sort(desc));
      setMonitored(new Set(result.monitored));
      setInLibrary(result.inLibrary);
      setStatus("ready");
    });
    return () => {
      alive = false;
    };
  }, [tmdbId]);

  function toggle(n: number) {
    if (monitored.has(n)) return;
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  if (status === "loading") return <p className="sub">{t.searchSeasonsLoading}</p>;
  if (status === "error") return <p className="error">{t.searchSeasonsFailed}</p>;
  if (seasons.length === 0) return <p className="sub">{t.searchSeasonsFailed}</p>;

  const available = seasons.filter((n) => !monitored.has(n));
  const showExpand = expandOnly || inLibrary;
  if (showExpand && available.length === 0) {
    return <p className="sub">{t.searchSeasonsNoneLeft}</p>;
  }

  const choosable = showExpand ? available : seasons;
  const latest = choosable.length > 0 ? Math.max(...choosable) : undefined;
  const rows = showExpand ? seasons : choosable;

  return (
    <fieldset className="season-picker">
      <legend className="season-legend">{showExpand ? t.searchSeasonsExpandLabel : t.searchSeasonsLabel}</legend>
      {picked.size === 0 ? <p className="season-hint">{t.searchSeasonsHint}</p> : null}
      {choosable.length > 0 ? (
        <div className="season-actions" role="group">
          {latest != null ? (
            <button type="button" className="season-chip" onClick={() => setPicked(new Set([latest]))}>
              {t.searchSeasonsLatest}
            </button>
          ) : null}
          <button type="button" className="season-chip" onClick={() => setPicked(new Set(choosable))}>
            {t.searchSeasonsAll}
          </button>
        </div>
      ) : null}
      <ul className="season-list">
        {rows.map((n) => {
          const already = monitored.has(n);
          if (showExpand && already) {
            return (
              <li key={n}>
                <div className="season-row is-monitored">
                  <span className="season-check" aria-hidden="true" />
                  <span className="season-label">
                    {t.searchSeasonMonitored.replace("{n}", String(n))}
                  </span>
                </div>
              </li>
            );
          }
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
  );
}
