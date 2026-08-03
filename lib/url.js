/* eslint-disable @typescript-eslint/no-var-requires */
/**
 * Business Helper — Dynamic URL & Domain Resolution Helper Engine (CommonJS Mirror for Test Runner)
 */

function getAppBaseUrl() {
  let url =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_VERCEL_URL ||
    process.env.VERCEL_URL ||
    'http://localhost:3000';

  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = `https://${url}`;
  }

  return url.replace(/\/+$/, '');
}

function getAuthCallbackUrl() {
  return `${getAppBaseUrl()}/auth/callback`;
}

function getStripeWebhookUrl() {
  return `${getAppBaseUrl()}/api/stripe/webhook`;
}

module.exports = {
  getAppBaseUrl,
  getAuthCallbackUrl,
  getStripeWebhookUrl,
};
