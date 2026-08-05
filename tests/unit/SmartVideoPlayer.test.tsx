import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SmartVideoPlayer } from '@/components/landing/SmartVideoPlayer';
import { getAssetUrl } from '@/lib/url';

describe('SmartVideoPlayer Component', () => {
  const defaultSrc = '/assets/demo/cuj_02_dashboard_mobile.webm';
  const defaultPoster = '/assets/demo/cuj_02_dashboard_kpis.png';

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CDN_URL;
  });

  it('should render poster image with getAssetUrl', () => {
    render(<SmartVideoPlayer src={defaultSrc} poster={defaultPoster} alt="Test Demo" />);
    const img = screen.getByAltText('Test Demo') as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toContain(getAssetUrl(defaultPoster));
  });

  it('should render video element with webm and mp4 fallback sources', () => {
    const { container } = render(<SmartVideoPlayer src={defaultSrc} poster={defaultPoster} />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();

    const sources = container.querySelectorAll('source');
    expect(sources.length).toBe(2);

    const mp4Source = Array.from(sources).find((s) => s.getAttribute('type') === 'video/mp4');
    const webmSource = Array.from(sources).find((s) => s.getAttribute('type') === 'video/webm');

    expect(mp4Source).not.toBeNull();
    expect(mp4Source?.getAttribute('src')).toBe('/assets/demo/cuj_02_dashboard_mobile.mp4');

    expect(webmSource).not.toBeNull();
    expect(webmSource?.getAttribute('src')).toBe('/assets/demo/cuj_02_dashboard_mobile.webm');
  });

  it('should apply CDN URL prefix when NEXT_PUBLIC_CDN_URL is set', () => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.businesshelper.mx';
    const { container } = render(<SmartVideoPlayer src={defaultSrc} poster={defaultPoster} alt="CDN Test" />);

    const img = screen.getByAltText('CDN Test') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.businesshelper.mx/assets/demo/cuj_02_dashboard_kpis.png');

    const sources = container.querySelectorAll('source');
    const webmSource = Array.from(sources).find((s) => s.getAttribute('type') === 'video/webm');
    expect(webmSource?.getAttribute('src')).toBe('https://cdn.businesshelper.mx/assets/demo/cuj_02_dashboard_mobile.webm');
  });

  it('should fall back gracefully to poster image when video triggers onError', () => {
    const { container } = render(<SmartVideoPlayer src={defaultSrc} poster={defaultPoster} alt="Error Fallback Test" />);
    const video = container.querySelector('video');
    expect(video).not.toBeNull();

    if (video) {
      fireEvent.error(video);
    }

    const img = screen.getByAltText('Error Fallback Test');
    expect(img).toBeDefined();
  });
});
