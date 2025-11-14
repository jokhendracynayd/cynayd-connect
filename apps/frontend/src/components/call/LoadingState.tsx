interface LoadingStateProps {
  message: string;
  subtitle?: string;
}

export default function LoadingState({ message, subtitle }: LoadingStateProps) {
  return (
    <div className={`flex min-h-screen items-center justify-center bg-[#f7f9fc] text-slate-600 ${subtitle ? '' : ''}`}>
      <div className={`text-center ${subtitle ? 'space-y-3' : ''}`}>
        <div className="mx-auto h-12 w-12 rounded-full border-2 border-slate-200 border-t-cyan-400 animate-spin" />
        <p className={`${subtitle ? '' : 'mt-4'} font-medium text-slate-800`}>{message}</p>
        {subtitle && (
          <p className="text-sm text-slate-500">{subtitle}</p>
        )}
      </div>
    </div>
  );
}

