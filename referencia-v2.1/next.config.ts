import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (base de desarrollo / demo) y el driver de PostgreSQL se cargan en Node, sin empaquetar.
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "exceljs", "jspdf", "jspdf-autotable"],
  // Archivos leídos en tiempo de ejecución por la base demo (migraciones y binarios WASM de PGlite).
  outputFileTracingIncludes: {
    "/**": ["./supabase/migrations/**", "./db/dev/**", "./node_modules/@electric-sql/pglite/dist/**"],
  },
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
    ];
  },
};

export default nextConfig;
