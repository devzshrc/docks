import { DirectionProvider } from "@/components/foundations/direction/direction";
import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/toast";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";
import "./globals.css";

// Inter for UI and body text, Geist for headings. Code uses the system Menlo stack.
// Variables live on <html> so the :root theme tokens in globals.css can reference them.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin"], variable: "--font-geist-face" });
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
      className={cn("light", inter.variable, geist.variable)}
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
