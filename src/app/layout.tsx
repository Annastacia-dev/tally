import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Plus_Jakarta_Sans, Space_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { ServiceWorker } from "@/components/ServiceWorker";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
// wdth lets headlines use the condensed cut (font-stretch 75%).
const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin"], axes: ["wdth", "opsz"] });
// Only for the Tally wordmark.
const spaceMono = Space_Mono({ variable: "--font-space-mono", subsets: ["latin"], weight: "700" });

export const metadata: Metadata = {
  title: "Tally: every subscription, tallied",
  description: "Find every subscription in your inbox, M-Pesa and bank statements, and get reminded before each renewal.",
  applicationName: "Tally",
  appleWebApp: { capable: true, title: "Tally", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#fffaf0",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={`${jakarta.variable} ${bricolage.variable} ${spaceMono.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange>
          {children}
        </ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
