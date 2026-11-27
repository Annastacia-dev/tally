import type { MetadataRoute } from "next";
import { withBase } from "@/lib/base-path";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: withBase("/"),
    name: "Tally: every subscription, tallied",
    short_name: "Tally",
    description: "Find every subscription in your inbox, M-Pesa and bank statements, and get reminded before each renewal.",
    start_url: withBase("/dashboard"),
    scope: withBase("/"),
    display: "standalone",
    background_color: "#fffaf0",
    theme_color: "#fffaf0",
    categories: ["finance", "productivity"],
    icons: [
      { src: withBase("/icons/icon-192.png"), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: withBase("/icons/icon-512.png"), sizes: "512x512", type: "image/png", purpose: "any" },
      { src: withBase("/icons/maskable-512.png"), sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
