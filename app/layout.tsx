import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Golf Club OS — One Platform. Every Department. Complete Control.",
  description: "Golf club operations management platform — interactive demonstration with fictional data.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0F3D2E" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="en"><body><Providers>{children}</Providers></body></html>);
}
