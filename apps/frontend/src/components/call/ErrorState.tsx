interface ErrorStateProps {
  error: string;
  onGoHome: () => void;
}

export default function ErrorState({ error, onGoHome }: ErrorStateProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fc]">
      <div className="max-w-md rounded-[24px] border border-rose-100 bg-white/90 px-8 py-10 text-center text-rose-500 shadow-[0_28px_70px_-40px_rgba(244,63,94,0.35)]">
        <div className="mb-4 text-5xl">⚠️</div>
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">Connection error</h1>
        <p className="mb-6 text-slate-500">{error}</p>
        <button
          onClick={onGoHome}
          className="rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 font-semibold text-white shadow-[0_18px_45px_-28px_rgba(14,165,233,0.55)] transition hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600"
        >
          Go Home
        </button>
      </div>
    </div>
  );
}

