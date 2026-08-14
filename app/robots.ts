import { MetadataRoute } from 'next';
import { getAppBaseUrl } from '@/lib/url';

/**
 * The `(dashboard)` route group publishes its pages at the TOP level — there
 * is no `/dashboard/…` prefix — so the exclusions must name the real paths
 * (#299): disallowing only `/dashboard/` left `/quotes`, `/settings` and the
 * rest invited into the index. The token pages (`/q/`, `/pay/`,
 * `/invitacion/`) are excluded too: their URLs are the credential, and a
 * leaked link should not gain a search-engine copy.
 *
 * No trailing slashes on the app paths: under robots prefix rules,
 * `/dashboard/` does not match `/dashboard` itself.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/api/',
          '/onboarding',
          '/quotes',
          '/clients',
          '/receivables',
          '/products',
          '/invoices',
          '/team',
          '/assistant',
          '/help',
          '/settings',
          '/admin',
          '/upgrade',
          '/q/',
          '/pay/',
          '/invitacion/',
        ],
      },
    ],
    // Through the builder, never a literal origin (#36/#47/#73's class, #299).
    sitemap: `${getAppBaseUrl()}/sitemap.xml`,
  };
}
