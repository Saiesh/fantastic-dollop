import type { MetadataRoute } from "next";

/**
 * Web App Manifest — drives the label shown when installing the PWA (Add to Home Screen / install prompt).
 * Why: `name` / `short_name` must match product branding; colors align with `themeColor` in layout viewport.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "IPL Fanbet",
    short_name: "IPL Fanbet",
    description: "Private IPL betting circles with invite codes and JWT sessions.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#060912",
    theme_color: "#060912",
    lang: "en",
  };
}
