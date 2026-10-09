"use client";
import { toast as notify } from "sonner";
export { Toaster } from "@/components/ui/sonner";
export type ToastAction = { label: string; onClick: () => void };
export function toast(
  message: string,
  kind: "success" | "error" | "info" = "success",
  action?: ToastAction,
) {
  notify[kind](message, {
    duration: kind === "error" ? 7000 : action ? 6500 : 3500,
    action: action
      ? { label: action.label, onClick: action.onClick }
      : undefined,
  });
}
