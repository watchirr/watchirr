"use client";

import { Children, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

function Chevron({ dir }: { dir: -1 | 1 }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d={dir < 0 ? "M10.5 3.5 6 8l4.5 4.5" : "M5.5 3.5 10 8 5.5 12.5"}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function TitleRail({
  label,
  prevLabel,
  nextLabel,
  children,
}: {
  label: string;
  prevLabel: string;
  nextLabel: string;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [back, setBack] = useState(false);
  const [fwd, setFwd] = useState(false);

  const n = Children.count(children);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;

    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setBack(el.scrollLeft > 1);
      setFwd(el.scrollLeft < max - 1);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [n]);

  function nudge(dir: -1 | 1) {
    const el = scroller.current;
    if (!el) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const step = Math.max(180, Math.round(el.clientWidth * 0.85));
    el.scrollBy({ left: dir * step, behavior: reduced ? "auto" : "smooth" });
  }

  function onKeyDown(e: KeyboardEvent<HTMLUListElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    nudge(e.key === "ArrowRight" ? 1 : -1);
  }

  return (
    <div className="rail-scroll">
      {back ? (
        <button type="button" className="rail-nav rail-nav-prev" aria-label={`${prevLabel} · ${label}`} onClick={() => nudge(-1)}>
          <Chevron dir={-1} />
        </button>
      ) : null}
      <ul ref={scroller} className="title-rail" aria-label={label} onKeyDown={onKeyDown}>
        {children}
      </ul>
      {fwd ? (
        <button type="button" className="rail-nav rail-nav-next" aria-label={`${nextLabel} · ${label}`} onClick={() => nudge(1)}>
          <Chevron dir={1} />
        </button>
      ) : null}
    </div>
  );
}
