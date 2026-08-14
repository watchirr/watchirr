import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { PrimaryNav } from "../primary-nav";
import { access, clearSessionCookie, currentLocale } from "@/lib/http";
import { messages } from "@/lib/locale";

export const dynamic = "force-dynamic";

async function logout() {
  "use server";
  await clearSessionCookie();
  redirect("/login");
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { access: gate } = await access();
  if (gate.status === "setup") redirect("/setup");
  if (gate.status === "login") redirect("/login");
  const t = messages[await currentLocale()];

  return (
    <div className="shell">
      <header className="header glass">
        <Link href="/" className="wordmark">
          Watch<em>irr</em>
        </Link>
        <div className="header-end">
          <PrimaryNav
            ariaLabel={t.navAria}
            items={[
              { href: "/", label: t.navWatchlist },
              { href: "/search", label: t.navSearch },
              { href: "/settings", label: t.navSettings },
            ]}
          />
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
  );
}
