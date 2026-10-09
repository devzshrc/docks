import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import "./globals.css";

// Geist for UI text, Geist Mono for code and monospace (paths, numbers).
// Variables live on <html> so the :root theme tokens in globals.css can reference them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-face" });
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono-face",
});
export const metadata: Metadata = {
  metadataBase: new URL("https://docks.devzshrc.in"),
  title: "Docks",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  description: "Guided code review for GitHub teams",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark", geist.variable, geistMono.variable)}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TRPCReactProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster />
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
