interface SidebarToggleButtonProps {
  isCollapsed: boolean;
  onToggle: () => void;
  position?: 'absolute' | 'relative';
}

export default function SidebarToggleButton({
  isCollapsed,
  onToggle,
  position = 'absolute',
}: SidebarToggleButtonProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={isCollapsed ? 'Show participants sidebar' : 'Hide participants sidebar'}
      aria-label={isCollapsed ? 'Show participants sidebar' : 'Hide participants sidebar'}
      aria-expanded={!isCollapsed}
      className={`pointer-events-auto ${position === 'absolute' ? 'absolute right-6 top-6' : ''} hidden items-center gap-2 rounded-full border border-white/60 bg-white/85 px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600 shadow-sm transition hover:border-cyan-200 hover:text-cyan-600 lg:inline-flex`}
    >
      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor">
        {isCollapsed ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 6l8 4-8 4V6z" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 6l-8 4 8 4V6z" />
        )}
      </svg>
      {isCollapsed ? 'Show participants' : 'Hide participants'}
    </button>
  );
}

