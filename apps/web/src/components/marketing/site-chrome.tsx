"use client";

import { RiArrowRightUpLine, RiCloseLine, RiMenuLine } from "@remixicon/react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { AppIcon } from "@/components/app-icon";
import { EASE } from "@/components/marketing/motion";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/#product", label: "Product" },
  { href: "/#workflow", label: "Workflow" },
  { href: "/pricing", label: "Pricing" },
  { href: "/#faq", label: "FAQ" },
];

/** Marketing pages are always light, whatever theme the app uses. */
export function MarketingFrame({ children }: { children: ReactNode }) {
  return (
    <div className="light relative min-h-svh overflow-x-clip bg-white text-[#111113] antialiased">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}

/** Black pill, the one primary action on marketing pages. */
export function PillButton({
  children,
  href,
  onClick,
  tone = "brand",
  size = "md",
  className,
  disabled,
}: {
  children: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: "brand" | "dark" | "light" | "white";
  size?: "sm" | "md" | "lg";
  className?: string;
  disabled?: boolean;
}) {
  const classes = cn(
    "group/pill relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full font-medium tracking-[-0.01em] whitespace-nowrap outline-none transition-[background-color,box-shadow,transform,color] duration-200 ease-power3-out active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-[#0369a1]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-4 [&_svg]:shrink-0",
    size === "sm" && "h-9 px-4 text-sm",
    size === "md" && "h-11 px-5 text-[15px]",
    size === "lg" && "h-[52px] px-7 text-base",
    tone === "brand" &&
      "bg-[#0369a1] text-white shadow-[0_1px_2px_rgb(7_60_100/0.35),0_10px_28px_-8px_rgb(3_105_161/0.6),0_0_0_1px_#075985,inset_0_1px_0_rgb(255_255_255/0.25),inset_0_-6px_12px_rgb(0_0_0/0.12)] hover:bg-[#0284c7] hover:shadow-[0_1px_2px_rgb(7_60_100/0.35),0_14px_34px_-8px_rgb(3_105_161/0.7),0_0_0_1px_#075985,inset_0_1px_0_rgb(255_255_255/0.25),inset_0_-6px_12px_rgb(0_0_0/0.12)]",
    tone === "dark" &&
      "bg-[#111113] text-white shadow-[0_1px_2px_rgb(0_0_0/0.2),0_8px_24px_-8px_rgb(0_0_0/0.35),inset_0_1px_0_rgb(255_255_255/0.12)] hover:bg-[#2a2a2e]",
    tone === "light" &&
      "bg-[#111113]/[0.055] text-[#111113] hover:bg-[#111113]/[0.09]",
    tone === "white" &&
      "bg-white text-[#111113] shadow-[0_1px_2px_rgb(0_0_0/0.2),inset_0_-1px_0_rgb(0_0_0/0.08)] hover:bg-white/90",
    className,
  );
  if (href)
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} className={classes} disabled={disabled}>
      {children}
    </button>
  );
}

function SiteNav() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, "change", (y) => setScrolled(y > 8));

  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ease-power3-out",
        scrolled || open
          ? "bg-white/[0.86] shadow-[0_1px_0_rgb(0_0_0/0.06)] backdrop-blur-xl backdrop-saturate-150"
          : "bg-transparent",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-5 md:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 rounded-lg text-[17px] font-semibold tracking-[-0.03em] outline-none focus-visible:ring-2 focus-visible:ring-[#0369a1]/50"
        >
          <AppIcon className="size-7" />
          Docks
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-[14px] text-[#55555b] transition-colors duration-150 hover:text-[#111113]"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          <Link
            href="/login"
            className="rounded-full px-3 py-2 text-[14px] text-[#55555b] transition-colors hover:text-[#111113]"
          >
            Sign in
          </Link>
          <PillButton href="/signup" size="sm">
            Start free
          </PillButton>
        </div>
        <button
          type="button"
          className="ml-auto flex size-10 items-center justify-center rounded-full md:hidden"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <RiCloseLine className="size-5" /> : <RiMenuLine className="size-5" />}
        </button>
      </div>
      <AnimatePresence>
        {open && (
          <motion.nav
            aria-label="Mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="overflow-hidden md:hidden"
          >
            <div className="flex flex-col gap-1 px-5 pt-2 pb-6">
              {LINKS.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="border-b border-black/5 py-3 text-[17px] tracking-[-0.02em]"
                >
                  {l.label}
                </Link>
              ))}
              <div className="mt-4 grid grid-cols-2 gap-2">
                <PillButton href="/login" tone="light">
                  Sign in
                </PillButton>
                <PillButton href="/signup">Start free</PillButton>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}

const FOOTER = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Overview" },
      { href: "/#workflow", label: "Workflow" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/signup", label: "Create a workspace" },
      { href: "/login", label: "Sign in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/#faq", label: "Questions" },
      { href: "mailto:devzshrcz@gmail.com", label: "Contact", external: true },
    ],
  },
];

function SiteFooter() {
  return (
    <footer className="relative border-t border-black/[0.06]">
      <div className="mx-auto grid max-w-[1200px] gap-12 px-5 py-16 md:grid-cols-[1.4fr_repeat(3,1fr)] md:px-8">
        <div className="flex flex-col gap-4">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-[-0.03em]">
            <AppIcon className="size-7" />
            Docks
          </Link>
          <p className="max-w-[16rem] text-sm leading-relaxed text-[#6b6b70]">
            Guided code review for GitHub teams. From review to release.
          </p>
        </div>
        {FOOTER.map((col) => (
          <div key={col.title} className="flex flex-col gap-3">
            <p className="text-[13px] font-medium text-[#111113]">{col.title}</p>
            {col.links.map((l) => (
              <Link
                key={l.label}
                href={l.href}
                className="inline-flex items-center gap-1 text-sm text-[#6b6b70] transition-colors hover:text-[#111113]"
              >
                {l.label}
                {"external" in l && <RiArrowRightUpLine aria-hidden className="size-3.5" />}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 border-t border-black/[0.06] px-5 py-6 text-[13px] text-[#8b8b92] md:px-8">
        <span>© {new Date().getFullYear()} Docks</span>
        <span>Made for teams that ship carefully.</span>
      </div>
    </footer>
  );
}
