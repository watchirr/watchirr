"use client";

import { useEffect, useState } from "react";

export function LocalePicker({
  locale,
  options,
  label,
  action,
}: {
  locale: string;
  options: readonly { locale: string; flag: string; name: string }[];
  label: string;
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState(locale);
  useEffect(() => setPicked(locale), [locale]);

  return (
    <form action={action}>
      <label htmlFor="locale">{label}</label>
      <select
        id="locale"
        name="locale"
        value={picked}
        onChange={(event) => {
          setPicked(event.currentTarget.value);
          event.currentTarget.form?.requestSubmit();
        }}
      >
        {options.map((opt) => (
          <option key={opt.locale} value={opt.locale}>
            {opt.flag} {opt.name}
          </option>
        ))}
      </select>
    </form>
  );
}
