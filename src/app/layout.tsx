import type { Metadata } from "next";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

/*
  Trois voix typographiques :
  · Fraunces — serif de display : titres, nameplate, chiffres éditoriaux
  · Geist    — sans-serif     : l’interface, le discours courant
  · Mono     — Geist Mono     : toute donnée variable (IDs, chiffres, logs)
*/
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Vigil — Console de confiance et de sécurité",
    template: "%s · Vigil",
  },
  description:
    "Console de modération pour communautés en ligne : règles ordonnées, incidents traçables, appels et journal d’audit immuable.",
  keywords: [
    "modération",
    "trust and safety",
    "journal d’audit",
    "Next.js",
    "TypeScript",
    "PostgreSQL",
  ],
  openGraph: {
    title: "Vigil — Console de confiance et de sécurité",
    description:
      "Règles ordonnées, incidents traçables, appels et journal d’audit immuable.",
    type: "website",
    locale: "fr_CA",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${fraunces.variable} ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
