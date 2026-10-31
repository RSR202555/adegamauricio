import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ADEGA DE MAURICIO — Gestão, PDV & Estoque",
  description: "Sistema integrado para Adega e Distribuidora",
  icons: {
    icon: "/logo.jpg",
    shortcut: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col bg-stone-950 text-stone-100">{children}</body>
    </html>
  );
}
