import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BrainMix - Neuro-Acoustic Matrix",
    short_name: "BrainMix",
    description:
      "Layered brainwave entrainment audio. Binaural, isochronic, gamma, drones, EMDR. Built with the Web Audio API.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#00ffcc",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    categories: ["health", "lifestyle", "music", "productivity"],
  };
}
