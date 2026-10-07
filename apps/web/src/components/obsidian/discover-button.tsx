"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { MouseEventHandler } from "react";
import { cn } from "@/lib/utils";
import "./discover-button.css";

export interface DiscoverButtonProps {
  label?: string;
  href?: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
  /** "sm" (44px) suits dashboards and empty states; "default" (66px) is the landing-page size. */
  size?: "default" | "sm";
  disabled?: boolean;
}

export function DiscoverButton({
  label = "Discover Components",
  href,
  onClick,
  className,
  size = "default",
  disabled,
}: DiscoverButtonProps) {
  const classes = cn("obsidian-discover-button", size === "sm" && "obsidian-discover-button--sm", className);
  const buttonFace = (
    <>
      <span className="obsidian-discover-button__fill" aria-hidden="true" />
      <span className="obsidian-discover-button__icon" aria-hidden="true">
        <ArrowRight size={size === "sm" ? 18 : 25} strokeWidth={2.25} />
      </span>
      <span className="obsidian-discover-button__text">{label}</span>
    </>
  );

  if (href) {
    return (
      // Internal links go through Next so navigation stays client-side.
      href.startsWith("/") ? (
        <Link className={classes} href={href}>
          {buttonFace}
        </Link>
      ) : (
        <a className={classes} href={href} target="_blank" rel="noreferrer">
          {buttonFace}
        </a>
      )
    );
  }

  return (
    <button className={classes} type="button" onClick={onClick} disabled={disabled}>
      {buttonFace}
    </button>
  );
}

export default DiscoverButton;
