import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Maria Chorizos - Punto de Venta",
  description: "Punto de venta para reporte de ventas diarias",
  icons: {
    icon: "/images/logo-red-bg.png",
    apple: "/images/logo-red-bg.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={jakarta.className}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
