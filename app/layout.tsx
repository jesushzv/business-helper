import React from 'react';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BusinessHelper | Operaciones SMB Mexico',
  description: 'Gestión de cotizaciones, clientes y cobranza SPEI para PyMEs en México',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
