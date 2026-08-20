import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { KindFilter } from "../kind-filter";
import { PrimaryNav } from "../primary-nav";
import { SearchBox, SearchForm } from "../search-box";
import { ToastProvider } from "../toast-host";
import { access, clearSessionCookie, currentLocale, currentTitleKind } from "@/lib/http";
import { messages } from "@/lib/locale";
import { KIND_META, parseKindFilter } from "@/lib/tmdb";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await clearSessionCookie();
  redirect("/login");
}

async function saveKind(formData: FormData) {
  "use server";
  const { store, access: gate } = await access();
  if (gate.status !== "app") redirect("/login");
  await store.setMeta(KIND_META, parseKindFilter(formData.get("kind")));
  revalidatePath("/", "layout");
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { access: gate } = await access();
  if (gate.status === "setup") redirect("/setup");
  if (gate.status === "login") redirect("/login");
  const t = messages[await currentLocale()];
  const kind = await currentTitleKind();

  return (
    <ToastProvider regionLabel={t.toastRegion} dismissLabel={t.toastDismiss}>
      <div className="shell">
        <header className="header glass">
          <Link href="/" className="wordmark">
            Watch<em>irr</em>
          </Link>
          <div className="header-find">
            <Suspense fallback={<SearchForm placeholder={t.searchPlaceholder} submit={t.searchSubmit} />}>
              <SearchBox placeholder={t.searchPlaceholder} submit={t.searchSubmit} />
            </Suspense>
            <KindFilter
              value={kind}
              all={t.searchKindAll}
              movie={t.searchKindMovie}
              tv={t.searchKindTv}
              ariaLabel={t.searchKindFilter}
              action={saveKind}
            />
          </div>
          <PrimaryNav
            className="header-nav"
            ariaLabel={t.navAria}
            items={[
              { href: "/", label: t.navWatchlist },
              { href: "/search", label: t.navSearch },
              { href: "/settings", label: t.navSettings },
            ]}
          />
          <div className="header-account">
            <span className="who">{gate.admin.login}</span>
            <form action={logout}>
              <button className="ghost" type="submit">
                {t.logOut}
              </button>
            </form>
          </div>
        </header>
        {children}
      </div>
    </ToastProvider>
  );
}
