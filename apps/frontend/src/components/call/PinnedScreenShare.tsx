import { useRef, useEffect } from 'react';
import type { ScreenShare } from '../../types/screenShare';

interface PinnedScreenShareProps {
  share: ScreenShare;
  stream?: MediaStream | null;
  onUnpin: () => void;
}

export default function PinnedScreenShare({
  share,
  stream,
  onUnpin,
}: PinnedScreenShareProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error('Error playing screen share video:', err);
      });
    }
  }, [stream]);

  const hasLiveVideo = stream?.getVideoTracks().some(t => t.readyState === 'live');

  return (
    <div className="relative rounded-3xl overflow-hidden bg-slate-950/90 border border-slate-900 w-full aspect-video shadow-[0_24px_60px_-32px_rgba(15,23,42,0.7)]">
      {hasLiveVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-contain"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <div className="text-center">
            <svg
              className="w-16 h-16 mx-auto text-gray-500 mb-2"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            <p className="text-gray-400 text-sm">Loading {share.name}'s screen...</p>
          </div>
        </div>
      )}

      {/* Name Badge */}
      <div className="absolute bottom-4 left-4 bg-black/70 text-white px-3 py-1.5 rounded-full flex items-center gap-2 backdrop-blur">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <span className="text-sm font-medium">{share.name}'s Screen</span>
        <span className="text-[11px] bg-amber-300 text-amber-900 px-2 py-0.5 rounded-full">📌 Pinned</span>
      </div>

      {/* Unpin Button */}
      <button
        onClick={onUnpin}
        className="absolute top-4 right-4 bg-white/15 hover:bg-white/25 text-white p-2 rounded-full transition"
        title="Unpin screen share"
        aria-label="Unpin screen share"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 5l14 14M19 5l-14 14"
          />
        </svg>
      </button>
    </div>
  );
}

