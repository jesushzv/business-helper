'use client';

import React, { useRef, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { getAssetUrl } from '@/lib/url';

interface SmartVideoPlayerProps {
  src?: string;
  poster: string;
  alt?: string;
  className?: string;
  objectFit?: 'cover' | 'contain' | 'fill';
  objectPosition?: 'object-top' | 'object-center' | 'object-bottom';
  screenshotOnly?: boolean;
}

export function SmartVideoPlayer({
  src = '',
  poster,
  alt = 'Demostración de pantalla de la aplicación',
  className = '',
  objectFit = 'cover',
  objectPosition = 'object-top',
  screenshotOnly = false,
}: SmartVideoPlayerProps) {
  const primarySrc = src ? getAssetUrl(src) : '';
  const primaryPoster = getAssetUrl(poster);

  const [currentSrc, setCurrentSrc] = useState(primarySrc);
  const [currentPoster, setCurrentPoster] = useState(primaryPoster);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setCurrentSrc(src ? getAssetUrl(src) : '');
    setCurrentPoster(getAssetUrl(poster));
    setHasError(false);
    setIsLoaded(false);
  }, [src, poster]);

  useEffect(() => {
    if (screenshotOnly || !currentSrc) return;

    const video = videoRef.current;
    if (!video) return;

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
            console.warn('Autoplay notice:', err);
            if (src && currentSrc !== src) {
              setCurrentSrc(src);
            }
          });
      }
    } catch (e) {
      console.warn('Video init notice:', e);
      if (src && currentSrc !== src) {
        setCurrentSrc(src);
      }
    }
  }, [currentSrc, screenshotOnly, src]);

  return (
    <div className={`relative w-full h-full min-h-[460px] bg-slate-950 rounded-2xl overflow-hidden flex items-center justify-center ${className}`}>
      {/* Loading Overlay with Spinning Emerald Icon */}
      {!isLoaded && !hasError && !screenshotOnly && !!currentSrc && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs z-20 transition-opacity duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2 rounded-full bg-slate-900/90 border border-slate-800 text-slate-300 text-xs font-bold shadow-xl">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span>Cargando vista previa...</span>
          </div>
        </div>
      )}

      {/* Screenshot Image View */}
      <img
        src={currentPoster}
        alt={alt}
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          if (currentPoster !== poster) {
            setCurrentPoster(poster);
          } else {
            setHasError(true);
          }
        }}
        className={`w-full h-full object-${objectFit} ${objectPosition} rounded-2xl transition-opacity duration-300 ${
          screenshotOnly || !currentSrc || !isLoaded || hasError
            ? 'opacity-100 relative z-10'
            : 'opacity-0 absolute inset-0'
        }`}
        loading="eager"
        decoding="async"
      />

      {/* HTML5 Video Element */}
      {!screenshotOnly && !!currentSrc && !hasError && (
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
            if (src && currentSrc !== src) {
              setCurrentSrc(src);
            } else {
              setHasError(true);
            }
          }}
          className={`w-full h-full object-${objectFit} ${objectPosition} rounded-2xl relative z-10 transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0'
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
