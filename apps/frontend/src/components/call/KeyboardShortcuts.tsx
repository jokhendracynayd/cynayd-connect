import { createPortal } from 'react-dom';

interface KeyboardShortcutsProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function KeyboardShortcuts({
  isOpen,
  onClose,
}: KeyboardShortcutsProps) {
  // Detect if user is on Mac to show Cmd instead of Ctrl
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform);
  const modifierKey = isMac ? 'Cmd' : 'Ctrl';

  if (!isOpen) return null;

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  if (!portalTarget) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 backdrop-blur-sm">
      <div className="relative max-w-md w-full rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_38px_80px_-40px_rgba(14,165,233,0.45)] p-8">
        <div className="flex items-center justify-between mb-6 text-slate-700">
          <h2 className="text-xl font-semibold tracking-tight">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-cyan-500 hover:bg-cyan-50 transition"
            aria-label="Close shortcuts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-6 text-slate-600">
          <p className="text-sm text-slate-500 mb-4">
            Use these keyboard shortcuts to quickly control your call. Shortcuts work when you're not typing in text fields.
          </p>

          <div className="space-y-3">
            {/* Toggle Microphone */}
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-cyan-200 hover:bg-cyan-50/40 transition">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <div>
                  <div className="font-semibold text-slate-900">Toggle Microphone</div>
                  <div className="text-xs text-slate-500">Mute or unmute your microphone</div>
                </div>
              </div>
              <kbd className="px-3 py-1.5 text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg shadow-sm">
                {modifierKey}+D
              </kbd>
            </div>

            {/* Toggle Camera */}
            <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 hover:border-cyan-200 hover:bg-cyan-50/40 transition">
              <div className="flex items-center gap-3">
                <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <div>
                  <div className="font-semibold text-slate-900">Toggle Camera</div>
                  <div className="text-xs text-slate-500">Turn your camera on or off</div>
                </div>
              </div>
              <kbd className="px-3 py-1.5 text-sm font-semibold text-slate-700 bg-slate-100 border border-slate-300 rounded-lg shadow-sm">
                {modifierKey}+F
              </kbd>
            </div>
          </div>

          {/* Note */}
          <div className="pt-4 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              <strong>Note:</strong> These shortcuts are disabled when typing in input fields, chat, or other text areas.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 rounded-full shadow-[0_18px_40px_-24px_rgba(14,165,233,0.7)] hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600 transition"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

