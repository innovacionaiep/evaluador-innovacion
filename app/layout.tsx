import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/ThemeProvider";
import { DEFAULT_THEME, THEME_STORAGE_KEY } from "@/lib/themes";
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
  title: "Evaluador de Innovación",
  description: "Agente evaluador con IA",
};

const themeInitScript = `(function(){try{var t=localStorage.getItem('${THEME_STORAGE_KEY}')||'${DEFAULT_THEME}';document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script id="theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
