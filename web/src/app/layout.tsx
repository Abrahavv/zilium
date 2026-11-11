import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zilium Protocol ($ZLM) - Deterministic Zero-Knowledge Privacy & Autonomous A2A Intent Settlement on NEAR",
  description: "Zilium Protocol ($ZLM) - Deterministic Zero-Knowledge Privacy & Autonomous A2A Intent Settlement on NEAR",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
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

