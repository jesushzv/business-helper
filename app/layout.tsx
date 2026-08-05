import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://businesshelper.app'),
  title: 'Business Helper | Cotizaciones, Cobranza y CFDI 4.0',
  description: 'La plataforma operativa para PyMEs en México: cotizaciones en 2 min, cobro por WhatsApp y facturación CFDI 4.0.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/logo-icon.svg',
  },
  openGraph: {
    title: 'Business Helper | Cotizaciones, Cobranza y CFDI 4.0',
    description: 'La plataforma todo-en-uno para PyMEs en México: cotizaciones rápidas, cobro por WhatsApp y CFDI 4.0.',
    url: 'https://businesshelper.app',
    siteName: 'Business Helper México',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Business Helper — Cotizaciones, Cobranza y Facturación para PyMEs',
      },
    ],
    locale: 'es_MX',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Business Helper | Cotizaciones, Cobranza y CFDI 4.0',
    description: 'Control de cotizaciones y cobranza por WhatsApp para PyMEs en México.',
    images: ['/og-image.png'],
  },
};

import { CookieBanner } from '@/components/layout/CookieBanner';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className={plusJakartaSans.variable}>
      <body className={`${plusJakartaSans.className} antialiased selection:bg-indigo-500 selection:text-white`}>
        {children}
        <CookieBanner />
      </body>
    </html>
  );
}

