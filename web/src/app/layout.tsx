import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZILIUM ($ZLM) | Deflationary ZK Commodity & A2A Settlement",
  description: "Monotonically increasing floor price, 1% deflationary dark pool, and autonomous agent settlement on NEAR Protocol",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-[#06080D]">{children}</body>
    </html>
  );
}

