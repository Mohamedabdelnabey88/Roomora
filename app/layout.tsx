import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roomora | تشغيل الفندق",
  description: "نظام تشغيل داخلي احترافي للفنادق"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ar" dir="rtl"><body>{children}</body></html>;
}
