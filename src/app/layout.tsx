import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vastiqx.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "VastiqX — agentic architecture, Vastu, estimate and build planning",
    template: "%s · VastiqX",
  },
  description:
    "VastiqX turns a plot and a brief into a traceable architectural plan, 3D massing, front/back/side elevations, Vastu advisory, room-wise and floor-wise cost, construction material quantities and a downloadable report. Every AI action is a typed domain tool call.",
  applicationName: "VastiqX",
  keywords: [
    "agentic architecture software",
    "AI house plan generator",
    "Vastu floor plan",
    "construction cost estimate India",
    "BOQ software",
    "floor plan area calculator",
    "gaj to square feet",
    "construction material calculator",
    "house elevation design templates",
    "architecture planning SaaS",
  ],
  authors: [{ name: "VastiqX", url: "https://github.com/inareshmatta/vastiqx" }],
  creator: "VastiqX",
  publisher: "VastiqX",
  category: "Architecture & Construction",
  alternates: { canonical: "/" },
  icons: {
    icon: [{ url: "/brand/vastiqx-mark.svg", type: "image/svg+xml" }],
    apple: [{ url: "/brand/vastiqx-mark.svg" }],
  },
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: siteUrl,
    siteName: "VastiqX",
    title: "VastiqX — from brief to buildable plan, every number traceable",
    description:
      "Agentic architecture and construction planning: parametric 2D/3D, elevations, Vastu, room-wise cost, material quantities and downloadable reports. Every AI action is a typed domain tool.",
    images: [{ url: "/brand/vastiqx-logo.svg", width: 1800, height: 860, alt: "VastiqX — Design, Vastu, Estimate, Build" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "VastiqX — agentic architecture & construction planning",
    description: "Plans, elevations, Vastu, room-wise cost and material quantities from one traceable parametric model.",
    images: ["/brand/vastiqx-logo.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-snippet": -1, "max-image-preview": "large", "max-video-preview": -1 },
  },
};

export const viewport: Viewport = {
  themeColor: "#0b2418",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body>{children}</body>
    </html>
  );
}
