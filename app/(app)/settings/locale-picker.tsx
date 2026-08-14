"use client";

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
  return (
    <form action={action}>
      <label htmlFor="locale">{label}</label>
      <select
        id="locale"
        name="locale"
        defaultValue={locale}
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
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
