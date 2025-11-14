interface LeaveButtonProps {
  isLeaving: boolean;
  onLeave: () => void;
}

export default function LeaveButton({ isLeaving, onLeave }: LeaveButtonProps) {
  return (
    <button
      onClick={onLeave}
      disabled={isLeaving}
      className="flex items-center gap-2 rounded-full bg-gradient-to-r from-rose-500 via-rose-600 to-rose-700 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(244,63,94,0.65)] transition hover:from-rose-600 hover:via-rose-700 hover:to-rose-800 disabled:cursor-not-allowed disabled:opacity-60"
      title={isLeaving ? 'Leaving room...' : 'Leave room'}
    >
      {isLeaving ? (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
      <span className="hidden sm:inline">Leave</span>
    </button>
  );
}

