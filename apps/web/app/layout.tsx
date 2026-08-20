import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face for page titles and figures only (Tailwind `font-serif`).
// Variable font, so no `weight` list — next/font ships the full axis and
// every weight we use is one file.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Catalyst Founder Toolkit",
  description:
    "A guided program that takes a founder's raw idea apart and rebuilds it into a business case worth backing.",
  // `app/icon.png` (Catalyst logo) is the App Router tab icon; public path
  // kept for apple-touch and explicit link tags.
  icons: {
    icon: [{ url: "/catalyst-logo.png", type: "image/png" }],
    apple: [{ url: "/catalyst-logo.png", type: "image/png" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
