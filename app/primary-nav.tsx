"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Watchlist" },
  { href: "/search", label: "Search" },
  { href: "/settings", label: "Settings" },
];

export function PrimaryNav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Primary">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={path === item.href ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
