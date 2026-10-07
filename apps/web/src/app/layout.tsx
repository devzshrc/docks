import type { Metadata } from "next";
import { Geist_Mono, Inter, Source_Serif_4, Victor_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import "./globals.css";

// Inter for UI text, Geist Mono for UI monospace (paths, numbers),
// Victor Mono for code. Variables live on <html> so the :root theme tokens
// in globals.css can reference them.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter-face" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono-face" });
const victorMono = Victor_Mono({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-victor-mono-face",
});
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
      className={cn(inter.variable, geistMono.variable, victorMono.variable, sourceSerif.variable)}
    >
      <body className="font-sans antialiased">
        <ThemeProvider>
          <TRPCReactProvider>
            <TooltipProvider>{children}</TooltipProvider>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
