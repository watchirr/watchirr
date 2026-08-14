import { currentLocale } from "@/lib/http";
import { messages } from "@/lib/locale";

export default async function SearchPage() {
  const t = messages[await currentLocale()];
  return (
    <main className="main">
      <section className="panel glass wide">
        <h1 className="section-head">{t.navSearch}</h1>
        <p className="muted">{t.searchSoon}</p>
      </section>
    </main>
  );
}
