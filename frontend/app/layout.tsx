import type { Metadata } from "next";
import Image from "next/image";
import { Geist_Mono } from "next/font/google";
import NavTabs from "./components/NavTabs";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
    <html lang="en" className={`${geistMono.variable} h-full antialiased`}>
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
          {/* COLORS: the wash keeps the photo as a quiet backdrop; raise/lower --wash
              opacity in globals.css to show more or less of it. */}
          <div className="absolute inset-0" style={{ background: "var(--wash)" }} />
        </div>
        <NavTabs />
        <div className="flex-1 min-w-0">{children}</div>
      </body>
    </html>
  );
}
