import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Navbar } from "@/components/navbar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    template: "YaTwoToo - %s",
    default: "YaTwoToo",
  },
  description: "Yad2 Real Estate Search & Alerts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#f5f5f7] text-[#1d1d1f]">
        <Navbar />
        <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1">
          {children}
        </main>
        <footer className="text-center py-6 text-xs text-[#86868b]">
          YaTwoToo
        </footer>
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
