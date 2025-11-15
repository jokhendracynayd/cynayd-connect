interface AdminBottomButtonsProps {
  onShowRoomSettings: () => void;
  onShowPendingRequests: () => void;
  pendingRequestsCount: number;
}

export default function AdminBottomButtons({
  onShowRoomSettings,
  onShowPendingRequests,
  pendingRequestsCount,
}: AdminBottomButtonsProps) {
  return (
    <>
      <button
        onClick={onShowRoomSettings}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-800/60 text-gray-400 transition-all duration-300 hover:bg-blue-600 hover:text-white hover:shadow-sm"
        title="Room settings"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>

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

