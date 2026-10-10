"use client";

// Adapted from https://www.shadcnblocks.com/r/navbar1.json.
import { RiMenuLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { AppIcon } from "@/components/app-icon";
import { Button, ButtonLink } from "@/components/base/buttons/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const MENU = [
  { title: "Home", url: "/" },
  { title: "Pricing", url: "/pricing" },
  { title: "FAQ", url: "/pricing#faq" },
];
const linkStyle =
  "inline-flex min-h-12 items-center rounded-md text-body-medium text-text-secondary hover:text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring";

export function Navbar1({ action }: { action?: ReactNode }) {
  const brand = (
    <a
      href="/"
      className="flex min-h-12 items-center gap-2 rounded-md text-title-2-semibold outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
    >
      <AppIcon className="size-8" />
      Docks
    </a>
  );
  const signup = action ?? (
    <ButtonLink href="/signup" className="min-h-12 px-5 shadow-none">
      Start free
    </ButtonLink>
  );
  return (
    <header className="border-b border-separator-border py-4">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <nav
          aria-label="Main"
          className="hidden items-center justify-between gap-6 lg:flex"
        >
          <div className="flex items-center gap-8">
            {brand}
            <div className="flex items-center gap-6">
              {MENU.map((item) => (
                <a key={item.title} href={item.url} className={linkStyle}>
                  {item.title}
                </a>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ButtonLink
              href="/login"
              variant="secondary"
              className="min-h-12 px-5 shadow-none"
            >
              Sign in
            </ButtonLink>
            {signup}
          </div>
        </nav>
        <div className="flex items-center justify-between lg:hidden">
          {brand}
          <Sheet>
            <SheetTrigger asChild>
              <Button
                variant="secondary"
                iconOnly
                leadingIcon={RiMenuLine}
                className="size-12 shadow-none"
                aria-label="Open menu"
              />
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle className="text-title-2-semibold">Docks</SheetTitle>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-4 p-4">
                {MENU.map((item) => (
                  <SheetClose key={item.title} asChild>
                    <a href={item.url} className={linkStyle}>
                      {item.title}
                    </a>
                  </SheetClose>
                ))}
                <SheetClose asChild>
                  <ButtonLink
                    href="/login"
                    variant="secondary"
                    className="min-h-12 shadow-none"
                  >
                    Sign in
                  </ButtonLink>
                </SheetClose>
                {signup}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
