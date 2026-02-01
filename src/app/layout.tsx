import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gnosis - Learn Ancient Greek",
  description:
    "An immersive conversational platform for learning Koine Greek through AI-powered dialogue scenarios.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className="animate-fade-in">{children}</body>
      </html>
    </ClerkProvider>
  );
}
