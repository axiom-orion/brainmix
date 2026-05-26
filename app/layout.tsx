import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "./register-sw";
import { AuthProvider } from "./auth-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://brainmix.vercel.app"),
  title: {
    default: "BrainMix · Neuro-Acoustic Matrix",
    template: "%s · BrainMix",
  },
  description:
    "Layered brainwave entrainment + DJ studio. Binaural/isochronic tones, drones, noise, your music, recordable mixes. PWA-installable.",
  applicationName: "BrainMix",
  generator: "Next.js",
  keywords: [
    "brainwave entrainment",
    "binaural beats",
    "isochronic tones",
    "DJ mixer",
    "focus music",
    "pomodoro",
    "PWA",
  ],
  authors: [{ name: "vorionsys" }],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "BrainMix",
  },
  openGraph: {
    type: "website",
    siteName: "BrainMix",
    title: "BrainMix · Neuro-Acoustic Matrix",
    description:
      "Layered brainwave entrainment + DJ studio. Your music, recordable mixes. Free, runs in any browser.",
    url: "https://brainmix.vercel.app",
    images: [{ url: "/icon.svg", width: 512, height: 512, alt: "BrainMix" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "BrainMix · Neuro-Acoustic Matrix",
    description:
      "Layered brainwave entrainment + DJ studio. Your music, recordable mixes.",
    images: ["/icon.svg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#00ffcc",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>
          {children}
          <RegisterSW />
        </AuthProvider>
      </body>
    </html>
  );
}
