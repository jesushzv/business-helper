import React from 'react';
import { getAppBaseUrl } from '@/lib/url';
import { LANDING_FAQS } from '@/lib/landingFaq';

export function JsonLd() {
  const baseUrl = getAppBaseUrl();

  // No aggregateRating: the product has no rating system, so any figure here
  // would be invented — hard rule #1, and review-markup spam under Google's
  // structured-data policy (#230). Add it back only over real collected
  // ratings a visitor can see.
  const softwareAppSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Business Helper',
    operatingSystem: 'Web, iOS, Android',
    applicationCategory: 'BusinessApplication',
    description:
      'La plataforma operativa para PyMEs en México: cotizaciones en 2 minutos, cobranza por WhatsApp y facturación CFDI 4.0 con SAT PAC.',
    url: baseUrl,
    offers: {
      '@type': 'Offer',
      price: '299.00',
      priceCurrency: 'MXN',
      availability: 'https://schema.org/InStock',
    },
  };

  // Mirrors the rendered FAQ verbatim — same source module the accordion
  // renders, so the schema cannot drift from what the visitor reads (#232).
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: LANDING_FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Business Helper',
    url: baseUrl,
    logo: `${baseUrl}/logo-icon.svg`,
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
