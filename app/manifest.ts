import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BrainMix · Neuro-Acoustic Matrix",
    short_name: "BrainMix",
    description:
      "Layered brainwave entrainment + DJ studio. Binaural, isochronic, gamma, drones, EMDR — over your own music.",
    start_url: "/",
    scope: "/",
    id: "brainmix",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    orientation: "portrait",
    background_color: "#09090b",
    theme_color: "#00ffcc",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
    categories: ["health", "lifestyle", "music", "productivity"],
    shortcuts: [
      {
        name: "Music",
        short_name: "Music",
        description: "Open the music tab",
        url: "/?view=music",
      },
      {
        name: "Studio",
        short_name: "Studio",
        description: "DJ studio + matrix",
        url: "/?view=studio",
      },
      {
        name: "Timer",
        short_name: "Timer",
        description: "Pomodoro / ultradian timer",
        url: "/?view=timer",
      },
    ],
    prefer_related_applications: false,
  };
}
