import { useRef, useEffect, useState } from 'react';
import type { ScreenShare } from '../../types/screenShare';

interface ScreenShareThumbnailProps {
  share: ScreenShare;
  stream?: MediaStream | null;
  onPin: () => void;
}

export default function ScreenShareThumbnail({
  share,
  stream,
  onPin,
}: ScreenShareThumbnailProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(err => {
        console.error('Error playing screen share thumbnail:', err);
      });
    }
  }, [stream]);

  const hasLiveVideo = stream?.getVideoTracks().some(t => t.readyState === 'live');

  return (
    <div
      className="relative rounded-2xl overflow-hidden bg-slate-900 aspect-video cursor-pointer border border-transparent hover:border-cyan-200 hover:shadow-[0_18px_45px_-28px_rgba(14,165,233,0.45)] transition-all"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onPin}
    >
      {hasLiveVideo && stream ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gray-800">
          <svg
            className="w-8 h-8 text-gray-500"
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
        </div>
      )}

      {/* Name Badge */}
      <div className="absolute bottom-2 left-2 bg-black/70 text-white px-2 py-1 rounded-full text-[11px] truncate max-w-[calc(100%-4rem)] backdrop-blur-sm">
        {share.name}
      </div>

      {/* Pin Button (shown on hover) */}
      {isHovered && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPin();
          }}
          className="absolute top-2 right-2 bg-cyan-500 hover:bg-cyan-600 text-white p-1.5 rounded-full transition-colors shadow-sm"
          title="Pin this screen share"
          aria-label="Pin screen share"
        >
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
              d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

