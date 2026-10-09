import type { ComponentProps } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
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
export const FrameHeader = CardHeader;
export const FrameTitle = CardTitle;
export const FrameDescription = CardDescription;
export const FramePanel = CardContent;
export const FrameFooter = CardFooter;
