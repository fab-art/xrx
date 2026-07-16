import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/rssb/theme-provider";
import { ServiceWorkerRegister } from "@/components/rssb/ServiceWorkerRegister";

const inter = Inter({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const APP_NAME = "RSSB Counter Verification System";
const APP_DESCRIPTION =
  "Prepare, verify, and audit pharmacy voucher claims — map columns, review vouchers, flag fraud, and generate Anti Fraud and Counter Verification reports.";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
  ),
  applicationName: APP_NAME,
  title: {
    default: APP_NAME,
    template: "%s · RSSB CVS",
  },
  description: APP_DESCRIPTION,
  keywords: ["RSSB", "pharmacy", "voucher", "verification", "fraud", "Rwanda", "RAMA", "claims"],
  authors: [{ name: "RSSB — Rwanda Social Security Board" }],
  creator: "RSSB",
  publisher: "RSSB",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: "black-translucent",
    startupImage: ["/icons/apple-touch-icon.png"],
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: [{ url: "/icons/og-image.png", width: 1200, height: 630, alt: APP_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: ["/icons/og-image.png"],
  },
  appLinks: undefined,
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1E3A8A" },
    { media: "(prefers-color-scheme: dark)", color: "#0F1123" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  colorScheme: "light dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* PWA + iOS meta tags that Next.js metadata doesn't fully cover */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <meta name="format-detection" content="telephone=no" />
      </head>
      <body
        className={`${inter.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
