import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SmartVideoPlayer } from '@/components/landing/SmartVideoPlayer';
import { getAssetUrl } from '@/lib/url';

describe('SmartVideoPlayer Component', () => {
  const defaultPoster = '/assets/demo/cuj_02_dashboard_kpis.png';

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_CDN_URL;
  });

  it('should render poster image with getAssetUrl', () => {
    render(<SmartVideoPlayer poster={defaultPoster} alt="Test Demo" />);
    const img = screen.getByAltText('Test Demo') as HTMLImageElement;
    expect(img).toBeDefined();
    expect(img.src).toContain(getAssetUrl(defaultPoster));
  });

  it('should apply CDN URL prefix when NEXT_PUBLIC_CDN_URL is set', () => {
    process.env.NEXT_PUBLIC_CDN_URL = 'https://cdn.businesshelper.mx';
    render(<SmartVideoPlayer poster={defaultPoster} alt="CDN Test" />);

    const img = screen.getByAltText('CDN Test') as HTMLImageElement;
    expect(img.src).toBe('https://cdn.businesshelper.mx/assets/demo/cuj_02_dashboard_kpis.png');
  });
});
