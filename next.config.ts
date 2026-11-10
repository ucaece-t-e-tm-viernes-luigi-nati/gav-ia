import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Se cargan en Node, sin empaquetar.
  serverExternalPackages: ["pg", "exceljs", "jspdf", "jspdf-autotable"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      // Las superficies internas no se indexan (además de robots.txt y metadata.robots).
      { source: "/empresa", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/empresa/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/plataforma", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
      { source: "/plataforma/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
