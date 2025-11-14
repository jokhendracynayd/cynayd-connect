interface OverflowParticipantsButtonProps {
  overflowCount: number;
  onClick: () => void;
}

export default function OverflowParticipantsButton({
  overflowCount,
  onClick,
}: OverflowParticipantsButtonProps) {
  if (overflowCount <= 0) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className="absolute right-6 top-6 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow transition hover:border-cyan-200 hover:text-cyan-600"
    >
      +{overflowCount} more participants
    </button>
  );
}

