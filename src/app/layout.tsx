import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { ColorModeToggle } from "@/components/theme/color-mode-toggle";
import { COLOR_MODE_SCRIPT } from "@/lib/branding/color-mode";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "SP Portal", template: "%s | SP Portal" },
  description: "School reports, marks and announcements for Zimbabwean schools.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The colour-mode script sets the `dark` class before React hydrates.
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_MODE_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <div className="mx-auto flex w-full max-w-5xl justify-end px-4 pb-3">
          <ColorModeToggle />
        </div>
        <SiteFooter />
      </body>
    </html>
  );
}
