"use client";

import { usePathname, useSearchParams } from "next/navigation";

export function SearchForm({
  placeholder,
  submit,
  q = "",
  autoFocus = false,
}: {
  placeholder: string;
  submit: string;
  q?: string;
  autoFocus?: boolean;
}) {
  return (
    <form className="header-search" action="/search" method="get">
      <input
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        autoFocus={autoFocus}
      />
      <button className="btn" type="submit">
        {submit}
      </button>
    </form>
  );
}

export function SearchBox({ placeholder, submit }: { placeholder: string; submit: string }) {
  const path = usePathname();
  const q = useSearchParams().get("q") ?? "";
  return <SearchForm placeholder={placeholder} submit={submit} q={q} autoFocus={path === "/"} />;
}
