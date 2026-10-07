import type { Metadata } from "next";
import { Fira_Code, Geist, Geist_Mono, Source_Serif_4 } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast"
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import "./globals.css";
import "@/components/obsidian/obsidian-theme.css";

// Geist for UI text, Geist Mono for UI monospace (paths, numbers),
// Fira Code for code. Variables live on <html> so the :root theme tokens
// in globals.css can reference them.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-face" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono-face" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-fira-code-face" });
const sourceSerif = Source_Serif_4({ subsets: ["latin"], variable: "--font-source-serif-face" });

export const metadata: Metadata = {
  title: "Docks",
  description: "Guided code review for GitHub teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(geist.variable, geistMono.variable, firaCode.variable, sourceSerif.variable)}
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
