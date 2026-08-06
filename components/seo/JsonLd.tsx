import React from 'react';

export function JsonLd() {
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Business Helper',
    operatingSystem: 'Web, iOS, Android',
    applicationCategory: 'BusinessApplication',
    description:
      'La plataforma operativa para PyMEs en México: cotizaciones en 2 minutos, cobranza por WhatsApp y facturación CFDI 4.0 con SAT PAC.',
    url: 'https://businesshelper.app',
    offers: {
      '@type': 'Offer',
      price: '299.00',
      priceCurrency: 'MXN',
      availability: 'https://schema.org/InStock',
    },
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: '4.9',
      ratingCount: '512',
    },
  };

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '¿Genera Notas de Venta y Facturas SAT CFDI 4.0?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Sí, Business Helper permite emitir Notas de Venta ilimitadas en formato PDF y timbrar facturas CFDI 4.0 directamente con PAC autorizado del SAT.',
        },
      },
      {
        '@type': 'Question',
        name: '¿Cómo funciona la integración con WhatsApp?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Genera enlaces directos wa.me pre-llenados para enviar cotizaciones, comprobantes y recordatorios de pago con 1 solo toque desde el celular.',
        },
      },
      {
        '@type': 'Question',
        name: '¿Es seguro el manejo de comprobantes y pagos SPEI?',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Tus clientes pueden cargar comprobantes SPEI directamente y los tokens de verificación OTP con firma digital SHA-256 garantizan total auditabilidad.',
        },
      },
    ],
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Business Helper S.A.P.I. de C.V.',
    url: 'https://businesshelper.app',
    logo: 'https://businesshelper.app/logo-icon.svg',
    contactPoint: {
      '@type': 'ContactPoint',
      email: 'contacto@businesshelper.app',
      contactType: 'customer service',
    },
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'Tijuana',
      addressRegion: 'B.C.',
      addressCountry: 'MX',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />
    </>
  );
}
