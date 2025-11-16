interface LeaveButtonProps {
  isLeaving: boolean;
  onLeave: () => void;
}

export default function LeaveButton({ isLeaving, onLeave }: LeaveButtonProps) {
  return (
    <button
      onClick={onLeave}
      disabled={isLeaving}
      className="flex items-center justify-center rounded-full bg-rose-500 h-12 w-12 text-white shadow-sm transition-all duration-300 hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-60"
      title={isLeaving ? 'Leaving room...' : 'Leave room'}
    >
      {isLeaving ? (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg className="h-10 w-8" fill="none" viewBox="0 -0.5 25 25" stroke="currentColor" strokeWidth={1.5}>
          <path fillRule="evenodd" clipRule="evenodd" d="M19.4949 12.652C19.5837 13.2266 19.5312 13.8142 19.3419 14.364C19.2281 14.559 19.0685 14.7234 18.8769 14.843C18.6129 14.988 18.5139 14.997 17.1769 15C16.6858 15.0489 16.1903 15.0283 15.7049 14.939C15.3955 14.845 15.1408 14.6234 15.0049 14.33C14.8748 13.9674 14.8306 13.5795 14.8759 13.197V12.728C14.8748 12.6039 14.7942 12.4946 14.6759 12.457C13.2728 12.0901 11.7991 12.0881 10.3949 12.451C10.239 12.4983 10.1315 12.641 10.1289 12.804V13.25C10.1323 13.5312 10.1193 13.8123 10.0899 14.092C9.99784 14.4834 9.71062 14.7997 9.32992 14.929C8.84346 15.0308 8.34396 15.0551 7.84992 15.001C6.59792 15.001 6.55992 15.001 6.34992 14.928C5.98277 14.8202 5.69683 14.5312 5.59292 14.163C5.50908 13.8367 5.48168 13.4985 5.51192 13.163C5.51192 12.732 5.51192 12.33 5.51192 12.271C5.55952 11.737 5.81352 11.2426 6.21992 10.893C6.97163 10.266 7.8516 9.81133 8.79792 9.56098C10.8241 8.93728 12.9744 8.83172 15.0519 9.25398C15.4932 9.33447 15.9277 9.44813 16.3519 9.59398C17.3636 9.8605 18.2839 10.3965 19.0149 11.145C19.3739 11.5607 19.5473 12.1052 19.4949 12.652V12.652Z" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

