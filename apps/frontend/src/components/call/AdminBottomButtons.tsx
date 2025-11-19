import { useState } from 'react';
import MoreOptionsDialog from './MoreOptionsDialog';

interface AdminBottomButtonsProps {
  onShowPendingRequests: () => void;
  pendingRequestsCount: number;
  roomCode?: string | undefined;
  currentIsPublic?: boolean | undefined;
  participantCount?: number | undefined;
}

export default function AdminBottomButtons({
  onShowPendingRequests,
  pendingRequestsCount,
  roomCode,
  currentIsPublic,
  participantCount,
}: AdminBottomButtonsProps) {
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
      />

      <button
        onClick={onShowPendingRequests}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
          pendingRequestsCount > 0
            ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
            : 'bg-gray-800/60 text-gray-400 hover:bg-blue-600 hover:text-white hover:shadow-sm'
        }`}
        title="Join requests"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
        </svg>
        {pendingRequestsCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-semibold text-white">
            {pendingRequestsCount}
          </span>
        )}
      </button>
    </>
  );
}

