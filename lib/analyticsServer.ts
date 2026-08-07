import { after } from 'next/server';
import { captureEvent, isAnalyticsConfigured, type CaptureOptions, type ProductEvent } from './analytics';

/**
 * Server-side recording of product events.
 *
 * Route handlers call this at the moment the write they describe has actually
 * landed — after the insert returned a row, not before it was attempted. An
 * event recorded on intent measures intent; the funnel needs outcomes.
 *
 * The capture runs in `after()`, so it costs the response no latency and still
 * completes: on a serverless platform an un-awaited promise is frozen the
 * moment the response is sent, which is how fire-and-forget analytics quietly
 * loses most of its events. Outside a request scope — a script, a unit test —
 * `after()` throws, and the capture falls back to running inline.
 */
export function trackServerEvent(event: ProductEvent, options: CaptureOptions): void {
  // Checked here as well as inside captureEvent so an unconfigured deployment
  // does not schedule work it will not do.
  if (!isAnalyticsConfigured()) return;

  const capture = () => captureEvent(event, options);

  try {
    after(capture);
  } catch {
    void capture();
  }
}
