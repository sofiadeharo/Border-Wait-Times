import type { Metadata } from "next";
import Image from "next/image";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import NavTabs from "./components/NavTabs";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Selawik: Microsoft's open-source (OFL) Segoe UI substitute, used wherever Segoe UI isn't
// installed (macOS, iOS, Android, Linux). License: app/fonts/Selawik-LICENSE.txt.
const selawik = localFont({
  variable: "--font-selawik",
  display: "swap",
  src: [
    { path: "./fonts/selawkl.woff2", weight: "300", style: "normal" },
    { path: "./fonts/selawk.woff2", weight: "400", style: "normal" },
    { path: "./fonts/selawksb.woff2", weight: "600", style: "normal" },
    { path: "./fonts/selawkb.woff2", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "El Paso – Ciudad Juárez Border Wait Times",
  description: "Live border crossing wait times, crossing planner, and community reports for El Paso / Ciudad Juárez.",
};

// LAYOUT: wraps every page. Body is a row flex: fixed background photo behind a
// light wash (-z-10), the NavTabs sidebar, then the page content.
// To swap the background image, drop a file in frontend/public/ and change `src`.
// Keep the filename ASCII-only: accented names (e.g. "Juárez") can be stored in a
// different Unicode form on macOS and then fail to load.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistMono.variable} ${selawik.variable} h-full antialiased`}>
      <body className="min-h-full flex">
        <div className="fixed inset-0 -z-10">
          <Image
            src="/bridge-of-the-americas-2016.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* COLORS: Frutiger Aero sky wash over the photo; tune --wash-* in globals.css. */}
          <div className="aero-wash" />
          {/* Decorative bubbles: [left, top, size in px, animation delay in s] */}
          {[
            [6, 70, 120, 0], [18, 22, 46, -3], [34, 82, 70, -6], [58, 12, 90, -2],
            [72, 64, 150, -8], [88, 28, 60, -5], [92, 85, 38, -10], [46, 48, 28, -4],
          ].map(([left, top, size, delay]) => (
            <div
              key={`${left}-${top}`}
              aria-hidden
              className="aero-bubble"
              style={{ left: `${left}%`, top: `${top}%`, width: size, height: size, animationDelay: `${delay}s` }}
            />
          ))}
        </div>
        <NavTabs />
        <div className="flex-1 min-w-0">{children}</div>
      </body>
    </html>
  );
}
