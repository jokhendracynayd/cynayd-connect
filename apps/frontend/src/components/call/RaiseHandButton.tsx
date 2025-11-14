import { HandRaisedIcon } from './icons';

interface RaiseHandButtonProps {
  isRaised: boolean;
  onToggle: () => void;
}

export default function RaiseHandButton({ isRaised, onToggle }: RaiseHandButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition ${
        isRaised
          ? 'bg-gradient-to-r from-amber-400 via-amber-500 to-amber-600 shadow-[0_15px_35px_-20px_rgba(251,191,36,0.65)] hover:from-amber-500 hover:via-amber-600 hover:to-amber-700'
          : 'bg-slate-800 hover:bg-slate-900'
      }`}
      title={isRaised ? 'Lower hand' : 'Raise hand'}
    >
      <HandRaisedIcon className="h-5 w-5" />
    </button>
  );
}

