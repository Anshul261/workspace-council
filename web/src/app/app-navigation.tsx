"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", index: "01", label: "Mission desk", detail: "Start and direct work" },
  { href: "/council", index: "02", label: "Council", detail: "Watch the team operate" },
];

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="app-navigation" aria-label="Workspace Council views">
      <p className="eyebrow">Workspace views</p>
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "app-nav-link is-active" : "app-nav-link"}
            href={item.href}
            key={item.href}
          >
            <span>{item.index}</span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </Link>
        );
      })}
    </nav>
  );
}
