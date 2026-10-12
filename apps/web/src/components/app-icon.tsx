import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

/**
 * The Docks mark: a review queue on a glass tile, two cards waiting behind and the front one
 * checked off. Rendered as an image of public/docks-icon.svg (the same art as app/icon.svg), so
 * every instance shares one cached file and no SVG ids can collide or differ between server and
 * client renders.
 */
export function AppIcon({ className, ...props }: ComponentProps<"img">) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/docks-icon.svg" alt="" aria-hidden width={64} height={64} draggable={false} className={cn("select-none", className)} {...props} />
  );
}
