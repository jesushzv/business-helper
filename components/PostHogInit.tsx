'use client';

import posthog from 'posthog-js';

const projectToken = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const isPostHogConfigured = Boolean(projectToken);

if (!projectToken) {
  if (process.env.NODE_ENV === 'development') {
    throw new Error(
      'NEXT_PUBLIC_POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once NEXT_PUBLIC_POSTHOG_KEY is configured'
    );
  }
} else {
  posthog.init(projectToken, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    defaults: '2025-05-24',
    capture_exceptions: true,
    debug: process.env.NODE_ENV === 'development',
  });
}

const RAW_ANALYTICS_DISTINCT_ID_STORAGE_KEY = 'bh_analytics_distinct_id';

export function identifyPostHogUser(
  userId: string,
  properties: { email?: string; name?: string }
) {
  if (!isPostHogConfigured) return;

  posthog.identify(userId, properties);
  localStorage.setItem(RAW_ANALYTICS_DISTINCT_ID_STORAGE_KEY, userId);
}

export function resetPostHogUser() {
  if (!isPostHogConfigured) return;

  posthog.reset();
  localStorage.removeItem(RAW_ANALYTICS_DISTINCT_ID_STORAGE_KEY);
}

export function capturePostHogException(
  error: Error,
  properties: { route: string; level: string }
) {
  if (!isPostHogConfigured) return;

  posthog.captureException(error, properties);
}

export function PostHogInit() {
  return null;
}
