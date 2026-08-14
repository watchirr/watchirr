"use client";

import { useEffect, useState, type CSSProperties } from "react";
import type { KindFilter as Kind } from "@/lib/tmdb";

export function KindFilter({
  value,
  all,
  movie,
  tv,
  ariaLabel,
  action,
}: {
  value: Kind;
  all: string;
  movie: string;
  tv: string;
  ariaLabel: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const opts = [
    { value: "all" as const, label: all },
    { value: "movie" as const, label: movie },
    { value: "tv" as const, label: tv },
  ];
  const [picked, setPicked] = useState(value);
  useEffect(() => setPicked(value), [value]);
  const index = Math.max(
    0,
    opts.findIndex((opt) => opt.value === picked),
  );

  return (
    <form
      className="kind-filter"
      action={action}
      aria-label={ariaLabel}
      style={{ "--kind": index } as CSSProperties}
    >
      <span className="kind-filter-thumb" aria-hidden="true" />
      {opts.map((opt) => (
        <button
          key={opt.value}
          type="submit"
          name="kind"
          value={opt.value}
          aria-pressed={opt.value === picked}
          onClick={(event) => {
            if (opt.value === picked) event.preventDefault();
            else setPicked(opt.value);
          }}
        >
          {opt.label}
        </button>
      ))}
      <span className="kind-filter-ink" aria-hidden="true">
        {opts.map((opt) => (
          <span key={opt.value}>{opt.label}</span>
        ))}
      </span>
    </form>
  );
}
