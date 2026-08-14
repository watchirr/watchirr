import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { access, currentLocale } from "@/lib/http";
import { isLocale, localeOptions, LOCALE_META, messages } from "@/lib/locale";
import { householdAction, loadHousehold } from "./actions";
import { HouseholdForm } from "./household-form";
import { LocalePicker } from "./locale-picker";

export const dynamic = "force-dynamic";

async function saveLocale(formData: FormData) {
  "use server";
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  const value = String(formData.get("locale") ?? "");
  if (!isLocale(value)) return;
  await store.setMeta(LOCALE_META, value);
  revalidatePath("/", "layout");
}

export default async function SettingsPage() {
  const locale = await currentLocale();
  const t = messages[locale];
  const initial = await loadHousehold();
  return (
    <main className="main">
      <section className="panel glass wide">
        <h1 className="section-head">{t.settingsTitle}</h1>
        <LocalePicker locale={locale} options={localeOptions} label={t.languageLabel} action={saveLocale} />
        <HouseholdForm action={householdAction} initial={initial} t={t} />
      </section>
    </main>
  );
}
