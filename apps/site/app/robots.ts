import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: [
      "https://chatjs.dev/sitemap.xml",
      "https://chatjs.dev/docs/sitemap.xml",
    ],
  };
}
