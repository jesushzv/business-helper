'use client';

import React, { useRef, useEffect, useState } from 'react';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);

    const video = videoRef.current;
    if (!video) return;

    // Explicitly enforce muted, defaultMuted, and playsInline for browser autoplay policies
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;

    // Force load and attempt programmatic playback
    try {
      video.load();
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsLoaded(true);
          })
          .catch((err) => {
            console.warn('Video autoplay failed or restricted by browser, using poster fallback:', err);
            setHasError(true);
          });
      }
    } catch (e) {
      console.warn('Video playback initialization error:', e);
      setHasError(true);
    }
  }, [src]);

  return (
    <div className={`relative w-full h-full min-h-[460px] bg-slate-950 rounded-2xl overflow-hidden ${className}`}>
      {/* Background / Fallback Screenshot Image (Ensures view is NEVER blank or black) */}
      <img
        src={poster}
        alt={alt}
        className={`absolute inset-0 w-full h-full object-cover rounded-2xl z-0 transition-opacity duration-300 ${
          isLoaded && !hasError ? 'opacity-0' : 'opacity-100'
        }`}
        loading="eager"
        decoding="async"
      />

      {/* HTML5 Video Element with Direct Src & Event Handlers */}
      {!hasError && (
        <video
          ref={videoRef}
          src={src}
          poster={poster}
          autoPlay
          loop
          muted
          playsInline
          onLoadedData={() => setIsLoaded(true)}
          onCanPlay={() => setIsLoaded(true)}
          onError={() => setHasError(true)}
          className={`w-full h-full object-cover rounded-2xl relative z-10 transition-opacity duration-300 ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
    </div>
  );
}
