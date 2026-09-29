import type { MetadataRoute } from "next";
import { APP_NAME, THEME } from "@/lib/config";

// Makes the site installable. "standalone" opens it full-screen with no
// browser UI when launched from the home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Log the meals you cook.",
    start_url: "/following",
    scope: "/",
    display: "standalone",
    background_color: THEME.light.background,
    theme_color: THEME.light.background,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        // Maskable: artwork kept inside the central 80% safe zone so Android
        // can crop it to any shape.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
