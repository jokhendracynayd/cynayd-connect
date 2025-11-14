interface CollapsedSidebarButtonProps {
  onExpand: () => void;
}

export default function CollapsedSidebarButton({ onExpand }: CollapsedSidebarButtonProps) {
  return (
    <div className="hidden lg:flex lg:flex-col lg:items-end">
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-600"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6l8 4-8 4V6z" />
        </svg>
        Show participants
      </button>
    </div>
  );
}

