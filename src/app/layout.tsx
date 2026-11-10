import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope", display: "swap" });

export const metadata: Metadata = {
  title: { default: "GavIA — Tu balneario, bajo control", template: "%s · GavIA" },
  description:
    "Software de gestión para balnearios: plano interactivo, reservas, disponibilidad, clientes y cobros en una única plataforma.",
};

export const viewport: Viewport = { themeColor: "#123B5D" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={manrope.variable}>
      <body>{children}</body>
    </html>
  );
}
