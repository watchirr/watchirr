import { currentLocale } from "@/lib/http";
import { messages } from "@/lib/locale";

export default async function WatchlistPage() {
  const t = messages[await currentLocale()];
  return (
    <main className="main">
      <section className="panel glass wide">
        <h1 className="section-head">{t.navWatchlist}</h1>
        <p className="muted">{t.watchlistEmpty}</p>
      </section>
    </main>
  );
}
