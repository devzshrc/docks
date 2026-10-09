import type { ComponentProps } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
export function Frame({
  spacing,
  stacked,
  variant,
  ...props
}: ComponentProps<typeof Card> & {
  spacing?: string;
  stacked?: boolean;
  variant?: string;
}) {
  return <Card {...props} />;
}
export function FrameHeader({
  className,
  ...props
}: ComponentProps<typeof CardHeader>) {
  return <CardHeader className={cn("flex flex-col", className)} {...props} />;
}
export const FrameTitle = CardTitle;
export const FrameDescription = CardDescription;
export const FramePanel = CardContent;
export const FrameFooter = CardFooter;
