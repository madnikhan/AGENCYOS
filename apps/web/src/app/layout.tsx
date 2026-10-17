import type { Metadata } from "next";
import { AuthShell } from "@/components/AuthShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Agency OS — AI Digital Marketing Automation",
  description:
    "AI-powered SEO and social publishing for any local business",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,650&family=Source+Sans+3:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <AuthShell>{children}</AuthShell>
      </body>
    </html>
  );
}
