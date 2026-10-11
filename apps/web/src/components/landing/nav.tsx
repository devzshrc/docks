"use client";

import { useEffect, useState } from "react";
import { AppIcon } from "@/components/app-icon";
import { cx } from "@/utils/cx";

const LINKS = [
  { label: "The problem", href: "/#problem" },
  { label: "How it works", href: "/#how" },
  { label: "Pricing", href: "/#pricing" },
  { label: "FAQ", href: "/#faq" },
];

const link =
  "rounded-md text-[14px] leading-5 font-medium text-[var(--l-ink-2)] transition-colors hover:text-[var(--l-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--l-blue)]";

export function LandingNav({ onStart }: { onStart: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={cx("fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-200",
        scrolled
          ? "bg-white/75 shadow-[0_1px_0_var(--l-line)] backdrop-blur-xl"
          : "bg-transparent",
      )}
    >
      <nav
        aria-label="Main"
        className="mx-auto grid h-16 max-w-[1120px] grid-cols-[1fr_auto] items-center px-4 sm:px-6 md:grid-cols-[1fr_auto_1fr]"
      >
        <a href="/" className={cx(link, "font-display flex items-center gap-2 text-[17px] font-semibold  text-[var(--l-ink)]")}>
          <AppIcon className="size-6" />
          Docks
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} className={link}>{l.label}</a>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-5">
          <a href="/login" className={link}>Sign in</a>
          <button type="button" onClick={onStart} className="l-btn l-btn-dark h-9 px-4 text-[14px]">
            Start free
          </button>
        </div>
      </nav>
    </header>
  );
}
