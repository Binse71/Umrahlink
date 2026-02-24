import type { Metadata } from "next";
import { Noto_Kufi_Arabic, Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import { LanguageProvider } from "@/components/LanguageProvider";
import "./globals.css";
import "./premium.css";

const heading = Fraunces({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["500", "600", "700"]
});

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "600", "700", "800"]
});

const arabic = Noto_Kufi_Arabic({
  subsets: ["arabic"],
  variable: "--font-arabic",
  weight: ["400", "500", "600", "700"]
});

export const metadata: Metadata = {
  title: "Umrah Link | Your trusted link to umrah support",
  description:
    "Umrah Link connects customers with verified providers for Umrah Badal, Ziyarah guides, and Umrah assistants through one trusted marketplace.",
  icons: {
    icon: "/umrah-link-logo.png",
    shortcut: "/umrah-link-logo.png",
    apple: "/umrah-link-logo.png"
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} ${arabic.variable}`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
