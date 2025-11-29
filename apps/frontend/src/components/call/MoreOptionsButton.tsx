import { useState } from 'react';
import MoreOptionsDialog from './MoreOptionsDialog';

interface MoreOptionsButtonProps {
  roomCode?: string | undefined;
  currentIsPublic?: boolean | undefined;
  participantCount?: number | undefined;
  isAdmin?: boolean;
}

export default function MoreOptionsButton({
  roomCode,
  currentIsPublic,
  participantCount,
  isAdmin = false,
}: MoreOptionsButtonProps) {
  const [showMoreDialog, setShowMoreDialog] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowMoreDialog(true)}
        className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
          showMoreDialog
            ? 'bg-blue-600 text-white shadow-sm'
            : 'bg-gray-800/60 text-gray-400 hover:bg-blue-600 hover:text-white hover:shadow-sm'
        }`}
        title="More options"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
          <circle cx="5" cy="12" r="1.5" />
          <circle cx="12" cy="12" r="1.5" />
          <circle cx="19" cy="12" r="1.5" />
        </svg>
      </button>

      <MoreOptionsDialog
        isOpen={showMoreDialog}
        onClose={() => setShowMoreDialog(false)}
        roomCode={roomCode}
        currentIsPublic={currentIsPublic}
        participantCount={participantCount}
        isAdmin={isAdmin}
      />
    </>
  );
}

