import type { MetadataRoute } from "next";

/**
 * Web app manifest. Lets the packing station be added to a phone's home
 * screen, where it opens full screen straight onto the packing queue.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ProofShield packing station",
    short_name: "ProofShield",
    description: "Scan, photograph and verify orders as they are packed.",
    start_url: "/app/pack",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1120",
    theme_color: "#0a1120",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "any" },
    ],
  };
}
