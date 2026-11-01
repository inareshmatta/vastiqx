import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "VastiqX — agentic architecture & construction planning",
    short_name: "VastiqX",
    description:
      "Parametric plans, 3D, elevations, Vastu, area compliance, room-wise cost and construction materials from one traceable model.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f2e7",
    theme_color: "#0b2418",
    icons: [
      { src: "/brand/vastiqx-mark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/vastiqx-mark.svg", sizes: "512x512", type: "image/svg+xml", purpose: "maskable" },
    ],
    categories: ["design", "productivity", "business", "utilities"],
  };
}
