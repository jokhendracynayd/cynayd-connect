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
    <div className="relative rounded-lg overflow-hidden bg-gray-900 w-full aspect-video">
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
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-70 text-white px-3 py-1.5 rounded-lg flex items-center space-x-2">
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
        <span className="text-xs bg-yellow-500 text-yellow-900 px-2 py-0.5 rounded">📌 Pinned</span>
      </div>

      {/* Unpin Button */}
      <button
        onClick={onUnpin}
        className="absolute top-4 right-4 bg-gray-800 bg-opacity-80 hover:bg-opacity-100 text-white p-2 rounded-full transition-colors"
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

