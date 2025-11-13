interface WarningBadgeProps {
  onClick?: () => void;
  className?: string;
}

export default function WarningBadge({ onClick, className = '' }: WarningBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={`absolute -top-1 -right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white shadow-lg transition hover:bg-orange-600 ${className}`}
      aria-label="Device warning - click for details"
      title="Click for device information"
    >
      <svg
        className="h-3 w-3 animate-pulse"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      {/* Pulse ring effect */}
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75"></span>
    </button>
  );
}

