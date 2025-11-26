import { useEffect, useState } from 'react';
import { reconnectionManager } from '../../lib/reconnectionManager';
import type { ReconnectionState } from '../../lib/reconnectionManager';

interface ReconnectionOverlayProps {
  onCancel?: () => void;
}

export default function ReconnectionOverlay({ onCancel }: ReconnectionOverlayProps) {
  const [state, setState] = useState<ReconnectionState>(reconnectionManager.getState());
  const [remainingTime, setRemainingTime] = useState<number>(0);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    // Subscribe to state changes
    const unsubscribe = reconnectionManager.onStateChange((newState) => {
      setState(newState);

      // Show success message briefly when reconnected
      if (newState === 'connected' && state === 'reconnecting') {
        setShowSuccess(true);
        setTimeout(() => {
          setShowSuccess(false);
        }, 2000);
      }
    });

    // Update remaining time every second
    const interval = setInterval(() => {
      if (state === 'reconnecting') {
        const remaining = reconnectionManager.getRemainingGracePeriod();
        setRemainingTime(Math.ceil(remaining / 1000));
      }
    }, 1000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [state]);

  // Don't show overlay if connected and not showing success
  if (state === 'connected' && !showSuccess) {
    return null;
  }

  // Show success message
  if (showSuccess && state === 'connected') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-2xl bg-white/95 px-8 py-6 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 rounded-full bg-green-500" />
            <p className="text-lg font-semibold text-slate-900">Reconnected!</p>
          </div>
        </div>
      </div>
    );
  }

  // Show reconnecting state
  if (state === 'reconnecting') {
    const isPaused = reconnectionManager.isPaused();
    
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-2xl bg-white/95 px-8 py-6 shadow-xl">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-cyan-400 animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold text-slate-900">
                {isPaused ? 'Connection paused' : 'Reconnecting...'}
              </p>
              {!isPaused && remainingTime > 0 && (
                <p className="mt-2 text-sm text-slate-500">
                  {remainingTime} {remainingTime === 1 ? 'second' : 'seconds'} remaining
                </p>
              )}
              {isPaused && (
                <p className="mt-2 text-sm text-slate-500">
                  Waiting for network connection...
                </p>
              )}
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="mt-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Show failed state
  if (state === 'failed') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="rounded-2xl bg-white/95 px-8 py-6 shadow-xl">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="text-4xl">⚠️</div>
            <div>
              <p className="text-lg font-semibold text-slate-900">Connection lost</p>
              <p className="mt-2 text-sm text-slate-500">
                Unable to reconnect. Please check your internet connection.
              </p>
            </div>
            {onCancel && (
              <button
                onClick={onCancel}
                className="mt-2 rounded-lg bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 font-semibold text-white shadow-lg transition hover:from-cyan-500 hover:via-sky-600 hover:to-indigo-600"
              >
                Return to Home
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}



