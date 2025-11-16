interface OverflowParticipantsButtonProps {
  overflowCount: number;
  totalParticipants: number;
  onClick: () => void;
}

export default function OverflowParticipantsButton({
  overflowCount,
  totalParticipants,
  onClick,
}: OverflowParticipantsButtonProps) {
  // Show button if there are overflow participants OR if grid is visually full (12+ participants)
  const shouldShow = overflowCount > 0 || totalParticipants >= 12;

  if (!shouldShow) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="absolute right-6 top-6 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow transition hover:border-cyan-200 hover:text-cyan-600"
    >
      {overflowCount > 0 
        ? `+${overflowCount} more participants`
        : `View all ${totalParticipants} participants`}
    </button>
  );
}

