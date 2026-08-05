'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { getAssetUrl } from '@/lib/url';

interface SmartVideoPlayerProps {
  src: string;
  poster: string;
  alt?: string;
  className?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  objectPosition?: 'object-top' | 'object-center' | 'object-bottom';
}

export function SmartVideoPlayer({
  src,
  poster,
  alt = 'Demostración de pantalla de la aplicación',
  className = '',
  objectFit = 'cover',
  objectPosition = 'object-top',
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
      {/* Loading Overlay with Spinning Emerald Icon */}
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs z-20 transition-opacity duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-bold shadow-xl">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span>Cargando vista previa...</span>
          </div>
        </div>
      )}

      {/* Warning Badge when Video Playback is Unavailable (Using Static Poster Fallback) */}
      {hasError && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/95 border border-amber-500/30 text-amber-300 text-[11px] font-semibold shadow-lg backdrop-blur-md">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Vista estática por política del navegador</span>
        </div>
      )}

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
        className={`absolute inset-0 w-full h-full object-${objectFit} ${objectPosition} rounded-2xl z-0 transition-opacity duration-300 ${
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
          className={`w-full h-full object-${objectFit} ${objectPosition} rounded-2xl relative z-10 transition-opacity duration-300 ${
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
