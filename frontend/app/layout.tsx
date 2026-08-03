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

// LAYOUT: wraps every page. Body is a row flex: fixed background photo (positioned
// behind everything via -z-10), the NavTabs sidebar, then the page content.
// To swap the background image, change the `src` below and drop the new file in
// frontend/public/. To change the sidebar width, edit NavTabs.tsx (not here).
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex">
        {/* LAYOUT: `fixed inset-0` pins this behind all content and keeps it in
            place while the page scrolls. */}
        <div className="fixed inset-0 -z-10">
          <Image
            src="/Bridge_of_the_Americas_(El_Paso–Ciudad_Juárez),_June_2016.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* COLORS: tint over the photo — light mode uses almond-cream, dark mode
              uses blackberry-cream. Raise/lower the opacity (`/85`, `/80`) to make
              the photo more or less visible through the wash. */}
          <div className="absolute inset-0 bg-white/70 dark:bg-blackberry-cream/80" />
        </div>
        <NavTabs />
        <div className="flex-1 min-w-0">{children}</div>
      </body>
    </html>
  );
}
