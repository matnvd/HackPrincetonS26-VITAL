import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "W.A.I.T. — Watchful AI Incident Triage",
  description: "Upload a video and get an AI-powered incident risk timeline.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-gray-100 min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
