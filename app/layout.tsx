import type { Metadata } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/Providers";
import "./globals.css";

const roboto = localFont({
  src: [
    { path: "./fonts/Roboto-400.ttf", weight: "400", style: "normal" },
    { path: "./fonts/Roboto-500.ttf", weight: "500", style: "normal" },
    { path: "./fonts/Roboto-700.ttf", weight: "700", style: "normal" },
  ],
  variable: "--font-roboto",
  display: "swap",
});
const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Simplo PMS",
  description: "Construction project management tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body
        className={`${roboto.variable} ${geistSans.variable} ${geistMono.variable} min-h-screen bg-canvas font-sans antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
