import { HandRaisedIcon } from './icons';

interface RaiseHandButtonProps {
  isRaised: boolean;
  onToggle: () => void;
}

export default function RaiseHandButton({ isRaised, onToggle }: RaiseHandButtonProps) {
  return (
    <button
      onClick={onToggle}
      className={`flex h-12 w-12 items-center justify-center rounded-full text-white transition-all duration-300 ${
        isRaised
          ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
          : 'bg-gray-800/60 text-gray-400 hover:bg-gray-700/70 hover:text-gray-300'
      }`}
      title={isRaised ? 'Lower hand' : 'Raise hand'}
    >
      <HandRaisedIcon className="h-5 w-5" />
    </button>
  );
}

