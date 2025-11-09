import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useCallStore } from '../store/callStore';

export default function JoinRoom() {
  const [roomCode, setRoomCode] = useState('');
  const navigate = useNavigate();
  const setRoomCodeStore = useCallStore(state => state.setRoomCode);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!roomCode.trim()) {
      toast.error('Please enter a room code');
      return;
    }
    
    const code = roomCode.trim();
    setRoomCodeStore(code);
    navigate(`/pre-join/${code}`);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-120px] top-[-80px] h-[360px] w-[360px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[120px]" />
        <div className="absolute right-[-140px] bottom-[-160px] h-[420px] w-[420px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[150px]" />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6 py-16 sm:px-8">
        <div className="flex w-full max-w-4xl flex-col gap-10 rounded-[32px] border border-slate-200 bg-white/90 p-10 shadow-[0_28px_65px_-35px_rgba(14,165,233,0.45)] backdrop-blur">
          <div className="flex flex-col gap-6 text-center sm:text-left">
            <div className="inline-flex self-center items-center gap-2 rounded-full border border-cyan-200 bg-white px-4 py-1 text-[11px] uppercase tracking-[0.35em] text-cyan-500 sm:self-start">
              CYNAYD Connect
            </div>
            <div className="grid gap-5 sm:grid-cols-[1.1fr_0.9fr] sm:items-start sm:gap-8">
              <div className="space-y-4">
                <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
                  Join a curated session.
                </h2>
                <p className="text-base leading-relaxed text-slate-600">
                  Drop in with your invite code and we’ll guide you straight to the lounge. Secure routing ensures only approved guests make it inside CYNAYD Connect spaces.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500 sm:justify-start">
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 shadow-[0_12px_24px_-20px_rgba(14,165,233,0.45)]">
                    Multi-factor ready
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 shadow-[0_12px_24px_-20px_rgba(14,165,233,0.45)]">
                    Instant lobby sync
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_24px_55px_-32px_rgba(14,165,233,0.5)]">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Enter code</p>
                  <span className="rounded-full border border-cyan-100 bg-cyan-50 px-3 py-1 text-[11px] text-cyan-600">
                    Step 1 of 2
                  </span>
                </div>
                <form className="mt-6 space-y-5" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label htmlFor="room-code" className="text-sm font-medium text-slate-700">
                      Room code
                    </label>
                    <div className="relative">
                      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                        <svg className="h-4 w-4 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M10 2a5 5 0 00-5 5v2H4a2 2 0 00-2 2v5h2.5v2h11v-2H18v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" />
                        </svg>
                      </div>
                      <input
                        id="room-code"
                        name="roomCode"
                        type="text"
                        required
                        value={roomCode}
                        onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                        className="w-full rounded-[18px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm tracking-[0.4em] text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                        placeholder="XXXX-XXXX-XXXX"
                        maxLength={14}
                        pattern="[A-Z0-9\\-]+"
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Your code is case-insensitive. We’ll automatically format it for you.
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[20px] bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_20px_45px_-22px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                  >
                    Continue
                    <svg
                      className="h-4 w-4 text-white/80 transition group-hover:translate-x-1"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="absolute inset-0 opacity-0 transition group-hover:opacity-100 group-hover:blur-md">
                      <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300" />
                    </span>
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

