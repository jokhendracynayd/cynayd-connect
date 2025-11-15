interface ScreenShareButtonProps {
  isScreenSharing: boolean;
  onToggle: () => void;
}

export default function ScreenShareButton({ isScreenSharing, onToggle }: ScreenShareButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition-all duration-300 ${
        isScreenSharing
          ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
          : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/70 hover:text-gray-300'
      }`}
      title={isScreenSharing ? 'Stop sharing screen' : 'Share your screen'}
    >
      {isScreenSharing ? (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      ) : (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

