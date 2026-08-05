import { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/dashboard/', '/api/', '/onboarding/'],
      },
    ],
    sitemap: 'https://businesshelper.app/sitemap.xml',
  };
}
