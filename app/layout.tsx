import type { Metadata } from "next";
import { JetBrains_Mono, Manrope } from "next/font/google";

import "./globals.css";
import { Providers } from "@/app/providers";
import { APP_NAME } from "@/lib/constants";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Janaagraha internal portal for timesheets.",
};

// Reads localStorage / OS preference and sets class="dark" on <html> before
// the first paint, eliminating theme flash on hard reload.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'||(t===null&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      // suppressHydrationWarning: the anti-flicker script may add "dark" to the
      // class list before React hydrates, causing a server/client mismatch on
      // the class attribute. This suppression is intentional and safe here.
      suppressHydrationWarning
      className={`${manrope.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
