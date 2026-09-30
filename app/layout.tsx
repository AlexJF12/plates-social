import type { Metadata, Viewport } from "next";
import { Young_Serif } from "next/font/google";
import { InstallHint } from "@/components/InstallHint";
import { ServiceWorker } from "@/components/ServiceWorker";
import { APP_NAME, THEME } from "@/lib/config";
import { CAPTURE_INSTALL_PROMPT } from "@/lib/installPrompt";
import "./globals.css";

// Display face (dish names, titles, stats). Self-hosted by next/font: no
// requests to Google from the browser.
const display = Young_Serif({ weight: "400", subsets: ["latin"], variable: "--font-young-serif" });

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Log the meals you cook.",
  // iOS reads these instead of the manifest for home-screen behaviour.
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Draw edge to edge; safe-area padding in globals.css keeps content clear
  // of the notch and home indicator.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME.light.background },
    { media: "(prefers-color-scheme: dark)", color: THEME.dark.background },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} h-full antialiased`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
      </head>
      {/* Extensions often add attributes to <body> before hydration; this
          ignores attribute diffs on this element only, not its children. */}
      <body
        className="min-h-full flex flex-col pt-safe pb-safe px-safe"
        suppressHydrationWarning
      >
        <InstallHint />
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
