'use client';

import React, { useState } from 'react';
import { getAssetUrl } from '@/lib/url';

interface SmartVideoPlayerProps {
  src?: string;
  poster: string;
  alt?: string;
  className?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  objectPosition?: 'object-top' | 'object-center' | 'object-bottom';
}

export function SmartVideoPlayer({
  poster,
  alt = 'Demostración de pantalla de la aplicación',
  className = '',
  objectFit = 'cover',
  objectPosition = 'object-top',
}: SmartVideoPlayerProps) {
  const primaryPoster = getAssetUrl(poster);
  const [currentPoster, setCurrentPoster] = useState(primaryPoster);

  return (
    <div className={`relative w-full h-full bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center ${className}`}>
      {/* Static App Screenshot Display */}
      {/* eslint-disable-next-line @next/next/no-img-element -- getAssetUrl() may resolve to the env-configured CDN origin, which next/image has no remotePatterns for; migration tracked in #82 */}
      <img
        src={currentPoster}
        alt={alt}
        onError={() => {
          if (currentPoster !== poster) {
            setCurrentPoster(poster);
          }
        }}
        className={`w-full h-full object-${objectFit} ${objectPosition} rounded-2xl relative z-10 transition-opacity duration-300 opacity-100`}
        loading="eager"
        decoding="async"
      />
    </div>
  );
}
