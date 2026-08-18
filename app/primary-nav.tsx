"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

function navCurrent(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  return path === href || path.startsWith(`${href}/`);
}

export function PrimaryNav({
  ariaLabel,
  items,
  className,
}: {
  ariaLabel: string;
  items: { href: string; label: string }[];
  className?: string;
}) {
  const path = usePathname();
  return (
    <nav className={className ? `nav ${className}` : "nav"} aria-label={ariaLabel}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={navCurrent(path, item.href) ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
