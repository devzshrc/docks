"use client";

import { useState } from "react";

import { cx } from "@/utils/cx";
import { Avatar } from "@/components/ui-compat/controls";

/** Illustrated placeholder from DiceBear on a soft pastel tile. The seed is an opaque id, never an email or a name. */
export const generatedAvatar = (seed: string) =>
  `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(seed)}&backgroundColor=dbeafe,e0f2fe,ede9fe,fce7f3,fef3c7,dcfce7&backgroundType=solid`;

/** Pictures to try in order: their own, their GitHub avatar, then a generated one. */
export const avatarSources = (seed: string, src?: string | null, githubLogin?: string | null) =>
  [src, githubLogin ? `https://github.com/${githubLogin}.png?size=160` : null, generatedAvatar(seed)].filter(
    (u): u is string => Boolean(u),
  );

/**
 * One avatar for everyone: their own picture when there is one, a GitHub avatar when we know the login,
 * otherwise a stable illustration generated from their id. Falls back to an initial if images can't load.
 */
export function PersonAvatar({
  seed,
  name,
  src,
  githubLogin,
  className,
}: {
  /** Stable, non-identifying id (user id, or the login for GitHub-only people). */
  seed: string;
  name?: string;
  src?: string | null;
  githubLogin?: string | null;
  className?: string;
}) {
  const chain = avatarSources(seed, src, githubLogin);
  const [step, setStep] = useState(0);
  const label = name ?? githubLogin ?? seed;
  return (
    <Avatar
      size="xs"
      src={chain[step]}
      alt={label}
      initials={label.slice(0, 1).toUpperCase()}
      title={label}
      aria-label={label}
      imageProps={{ onError: () => setStep((n) => n + 1) }}
      className={cx(className)}
    />
  );
}
