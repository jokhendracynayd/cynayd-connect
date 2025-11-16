import { useState, useEffect, useRef } from 'react';

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
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMoreMenu(false);
      }
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowMoreMenu(false);
      }
    };

    if (showMoreMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeydown);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [showMoreMenu]);

  const handleSettingsClick = () => {
    setShowMoreMenu(false);
    onShowRoomSettings();
  };


  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setShowMoreMenu(!showMoreMenu)}
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300 ${
            showMoreMenu
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

        {showMoreMenu && (
          <div className="absolute bottom-full right-0 mb-2 z-50 min-w-[200px] rounded-xl border border-slate-200 bg-white/95 py-2 shadow-[0_20px_50px_-20px_rgba(14,165,233,0.4)] backdrop-blur">
            <button
              onClick={handleSettingsClick}
              className="w-full px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50 transition flex items-center gap-3"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Settings</span>
            </button>
          </div>
        )}
      </div>

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

