import { TooltipProvider } from "@/components/ui/tooltip";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700", "800"],
});

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Greenplot — The Living Laboratory",
  description: "Your AI-powered second brain",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Greenplot",
  },
};

export const viewport: Viewport = {
  themeColor: "#01120b",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", jakarta.variable, beVietnam.variable)}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body
        className="min-h-screen bg-[#01120b] text-[#e4fcf0]"
        style={{ fontFamily: "Plus Jakarta Sans, Be Vietnam Pro, sans-serif" }}
      >
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
