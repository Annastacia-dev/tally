import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tally: every subscription, tallied",
    short_name: "Tally",
    description: "Find every subscription in your inbox, M-Pesa and bank statements, and get reminded before each renewal.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ff",
    theme_color: "#f6f4ff",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
