import type { ScreenShare } from '../../types/screenShare';
import PinnedScreenShare from './PinnedScreenShare';
import ScreenShareThumbnail from './ScreenShareThumbnail';

interface ScreenShareSectionProps {
  screenShares: Map<string, ScreenShare>;
  pinnedUserId: string | null;
  onPin: (userId: string) => void;
  remoteStreams: Map<string, MediaStream>; // Screen share streams
  currentUserId?: string; // Current user's ID to hide their own screen share
}

export default function ScreenShareSection({
  screenShares,
  pinnedUserId,
  onPin,
  remoteStreams,
  currentUserId,
}: ScreenShareSectionProps) {
  // Filter out current user's screen share (they don't need to see their own)
  const filteredShares = Array.from(screenShares.values()).filter(
    s => s.userId !== currentUserId
  );
  
  const pinnedShare = pinnedUserId && pinnedUserId !== currentUserId 
    ? screenShares.get(pinnedUserId) 
    : null;
  const otherShares = filteredShares.filter(
    s => s.userId !== pinnedUserId
  );

  if (filteredShares.length === 0) {
    return null; // Don't render if no screen shares (excluding current user's)
  }

  return (
    <div className="screen-share-container mb-4">
      {/* Header */}
      <div className="flex items-center space-x-2 mb-3">
        <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
          />
        </svg>
        <h3 className="text-gray-300 font-semibold text-sm">Screen Shares</h3>
      </div>
      
      {/* Pinned Screen Share */}
      {pinnedShare && (
        <PinnedScreenShare
          share={pinnedShare}
          stream={remoteStreams.get(pinnedShare.userId)}
          onUnpin={() => onPin(pinnedShare.userId)}
        />
      )}

      {/* Other Screen Shares - Thumbnails */}
      {otherShares.length > 0 && (
        <div className="screen-share-thumbnails grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
          {otherShares.map(share => (
            <ScreenShareThumbnail
              key={share.userId}
              share={share}
              stream={remoteStreams.get(share.userId)}
              onPin={() => onPin(share.userId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

