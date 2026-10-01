import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SneakDrop — Limited Edition Sneaker Sale",
  description: "Exclusive limited sneaker drop. Only 20 pairs. 5-minute holds. No restocks.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
