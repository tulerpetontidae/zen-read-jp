import type { Metadata } from "next";
import { Noto_Serif_JP, Shippori_Mincho } from "next/font/google";
import "./globals.css";

const notoSerifJP = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["200", "400", "700", "900"],
});

const shipporiMincho = Shippori_Mincho({
  variable: "--font-shippori-mincho",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Zen Reader JP",
  description: "Immersion through reading",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${notoSerifJP.variable} ${shipporiMincho.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
