'use client';

import React, { useRef, useEffect, useState } from 'react';
import { getAssetUrl } from '@/lib/url';

interface SmartVideoPlayerProps {
  src: string;
  poster: string;
  alt?: string;
  className?: string;
}

export function SmartVideoPlayer({
  src,
  poster,
  alt = 'Demostración de pantalla de la aplicación',
  className = '',
}: SmartVideoPlayerProps) {
  const primarySrc = getAssetUrl(src);
  const primaryPoster = getAssetUrl(poster);

  const [currentSrc, setCurrentSrc] = useState(primarySrc);
  const [currentPoster, setCurrentPoster] = useState(primaryPoster);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setCurrentSrc(getAssetUrl(src));
    setCurrentPoster(getAssetUrl(poster));
    setHasError(false);
    setIsLoaded(false);
  }, [src, poster]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Explicitly enforce muted, defaultMuted, and playsInline for browser autoplay policies
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    try {
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsLoaded(true);
          })
          .catch((err) => {
            console.warn('Video playback notice:', err);
            // If primary CDN src failed, fallback to local path before setting hasError
            if (currentSrc !== src) {
              setCurrentSrc(src);
            } else {
              setHasError(true);
            }
          });
      }
    } catch (e) {
      console.warn('Video init error:', e);
      setHasError(true);
    }
  }, [currentSrc]);

  return (
    <div className={`relative w-full h-full min-h-[460px] bg-slate-950 rounded-2xl overflow-hidden ${className}`}>
      {/* Background / Fallback Screenshot Image with Automatic Fallback */}
      <img
        src={currentPoster}
        alt={alt}
        onError={() => {
          // If CDN poster failed (403/404), fall back to local relative path
          if (currentPoster !== poster) {
            setCurrentPoster(poster);
          }
        }}
        className={`absolute inset-0 w-full h-full object-cover rounded-2xl z-0 transition-opacity duration-300 ${
          isLoaded && !hasError ? 'opacity-0' : 'opacity-100'
        }`}
        loading="eager"
        decoding="async"
      />

      {/* HTML5 Video Element with Multi-Tier Fallback */}
      {!hasError && (
        <video
          ref={videoRef}
          poster={currentPoster}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setIsLoaded(true)}
          onCanPlay={() => setIsLoaded(true)}
          onError={() => {
            if (currentSrc !== src) {
              setCurrentSrc(src);
            } else {
              setHasError(true);
            }
          }}
          className={`w-full h-full object-cover rounded-2xl relative z-10 transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {currentSrc.endsWith('.webm') && (
            <source src={currentSrc.replace('.webm', '.mp4')} type="video/mp4" />
          )}
          <source src={currentSrc} type={currentSrc.endsWith('.webm') ? 'video/webm' : 'video/mp4'} />
        </video>
      )}
    </div>
  );
}
