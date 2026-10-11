import { DirectionProvider } from "@/components/foundations/direction/direction";
import type { Metadata } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
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
// Inter for landing body copy; Geist stays the display and UI face.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter-face" });
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
      className={cn("light", geist.variable, geistMono.variable, inter.variable)}
    >
      <body className="font-sans antialiased">
        <DirectionProvider locale="en-US">
          <ThemeProvider>
            <PostHogProvider>
              <TRPCReactProvider>
                <TooltipProvider>{children}</TooltipProvider>
                <Toaster />
              </TRPCReactProvider>
            </PostHogProvider>
          </ThemeProvider>
        </DirectionProvider>
      </body>
    </html>
  );
}
