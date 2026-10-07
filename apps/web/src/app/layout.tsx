import type { Metadata } from "next";
import { Geist_Mono, Instrument_Serif, Source_Serif_4, Space_Grotesk } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast"
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import "./globals.css";
import "@/components/obsidian/obsidian-theme.css";

// Space Grotesk for UI text. Geist Mono for code and monospace (paths, numbers).
// Variables live on <html> so the :root theme tokens in globals.css can reference them.
const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-space-grotesk-face" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono-face" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-face" });
// Display serif for the landing page headlines only.
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], weight: "400", style: ["normal", "italic"], variable: "--font-display-face" });

export const metadata: Metadata = {
  title: "Docks",
  description: "Guided code review for GitHub teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(spaceGrotesk.variable, geistMono.variable, sourceSerif.variable, instrumentSerif.variable)}
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
