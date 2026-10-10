import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/admin-shell";
export const metadata: Metadata = {
  title: "Administration · Docks",
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
