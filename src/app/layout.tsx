import type { Metadata } from "next";
import Script from "next/script";
import { Noto_Serif_JP, Noto_Sans_JP, Noto_Serif } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";

const notoSerifJP = Noto_Serif_JP({
  variable: "--font-noto-serif-jp",
  subsets: ["latin"],
  weight: ["200", "400", "700", "900"],
});

const notoSerif = Noto_Serif({
  variable: "--font-noto-serif",
  subsets: ["latin", "latin-ext"], // latin-ext often helps diacritics
  weight: ["200", "400", "700", "900"],
});

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  weight: ["300", "400", "500", "700"],
});

export const metadata: Metadata = {
  title: "EnsoRead",
  description: "Master languages through reading immersion",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="theme-light" suppressHydrationWarning>
      <body
        className={`${notoSerifJP.variable} ${notoSerif.variable} ${notoSansJP.variable} antialiased`}
      >
        <Script
          id="theme-loader"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('enso-read-theme');
                  if (theme && ['light', 'sepia', 'dark'].includes(theme)) {
                    document.documentElement.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
                    document.documentElement.classList.add('theme-' + theme);
                  }
                } catch (e) {
                  // localStorage might be disabled, use default
                }
              })();
            `,
          }}
        />
        <ThemeProvider>{children}</ThemeProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
