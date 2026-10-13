import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "XLXOS — Mod Platform",
  description: "Deine private Minecraft-Mod-Plattform.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
