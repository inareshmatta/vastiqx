import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "https://vastiqx.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/dashboard", "/llms.txt"],
        disallow: ["/api/", "/projects/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
