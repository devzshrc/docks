import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import { DirectionProvider } from "@/components/foundations/direction/direction";
import "./globals.css";
import "@/components/obsidian/obsidian-theme.css";

// Inter for UI text. Geist Mono for code and monospace (paths, numbers).
// Variables live on <html> so the :root theme tokens in globals.css can reference them.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter-face" });
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
      className={cn(inter.variable, geistMono.variable)}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <DirectionProvider locale="en-US">
            <TRPCReactProvider>
              <TooltipProvider>{children}</TooltipProvider>
              <Toaster />
            </TRPCReactProvider>
          </DirectionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
