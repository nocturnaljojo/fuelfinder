import { defineConfig } from "vite";
import react             from "@vitejs/plugin-react";
import { VitePWA }       from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",

      // Pre-cache all static assets so the shell loads offline
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,png,woff2}"],
        // Don't pre-cache Supabase / Clerk API calls — too dynamic
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },

      includeAssets: ["fuel-icon.svg", "apple-touch-icon.png", "pwa-192.png", "pwa-512.png"],

      manifest: {
        name:             "FuelFinder Canberra",
        short_name:       "FuelFinder",
        description:      "Real-time fuel prices at Canberra ACT service stations — sorted by distance and price.",
        theme_color:      "#0f172a",
        background_color: "#0f172a",
        display:          "standalone",
        orientation:      "portrait-primary",
        scope:            "/",
        start_url:        "/",
        lang:             "en-AU",
        categories:       ["utilities", "navigation"],
        icons: [
          {
            src:   "pwa-192.png",
            sizes: "192x192",
            type:  "image/png",
          },
          {
            src:   "pwa-512.png",
            sizes: "512x512",
            type:  "image/png",
          },
          {
            src:     "pwa-512.png",
            sizes:   "512x512",
            type:    "image/png",
            purpose: "maskable",
          },
        ],
        screenshots: [
          {
            src:          "pwa-512.png",
            sizes:        "512x512",
            type:         "image/png",
            form_factor:  "narrow",
            label:        "FuelFinder — cheapest fuel near you",
          },
        ],
      },
    }),
  ],
});
