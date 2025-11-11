import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Home() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    navigate('/rooms/create');
  };

  const handleJoinRoom = () => {
    navigate('/rooms/join');
  };

  return (
    <div className="flex h-screen flex-col bg-[#f7f9fc] text-slate-900">
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 left-1/4 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-100 via-sky-100 to-indigo-100 opacity-80 blur-3xl" />
          <div className="absolute bottom-[-120px] right-0 h-[360px] w-[360px] translate-x-1/3 rounded-full bg-gradient-to-br from-white via-cyan-100 to-indigo-100 opacity-70 blur-[140px]" />
        </div>

        <header className="relative z-10 border-b border-slate-200 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 via-sky-400 to-indigo-400 text-lg font-semibold text-white shadow-[0_18px_45px_-18px_rgba(14,165,233,0.55)]">
                CY
              </span>
              <div>
                <p className="font-heading text-xs uppercase tracking-[0.45em] text-slate-500">CYNAYD</p>
                <h1 className="font-heading text-xl font-semibold tracking-wide text-slate-900">Connect</h1>
              </div>
            </div>

            <div className="flex items-center gap-5">
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Signed in as</p>
                <p className="text-sm font-medium text-slate-700">{user?.name ?? 'Guest'}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/60"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex flex-1">
          <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-16 px-6 py-12 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-24 lg:py-16">
            <div className="max-w-xl">
              <p className="font-heading inline-flex items-center rounded-full border border-cyan-200 bg-white px-4 py-1 text-xs font-medium uppercase tracking-[0.4em] text-cyan-500 shadow-[0_10px_30px_-18px_rgba(14,165,233,0.7)]">
                CYNAYD Connect
              </p>
              <h2 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Premium meetings designed for elevated teams.
              </h2>
              <p className="mt-6 text-lg leading-relaxed text-slate-600">
                Experience cinematic video, lifelike audio, and built-in collaboration. CYNAYD Connect delivers a polished, dependable workspace so every session feels intentional.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  onClick={handleCreateRoom}
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-medium uppercase tracking-[0.2em] text-white shadow-[0_18px_36px_-16px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
                >
                  <span className="relative z-10">Start a session</span>
                  <span className="relative z-10 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs text-white">
                    +
                  </span>
                  <span className="absolute inset-0 opacity-0 transition group-hover:opacity-100 group-hover:blur-md">
                    <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300" />
                  </span>
                </button>
                <button
                  onClick={handleJoinRoom}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-medium uppercase tracking-[0.2em] text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
                >
                  Join a room
                  <svg className="h-4 w-4 text-cyan-500" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M10.293 3.293a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L13.586 10H4a1 1 0 110-2h9.586l-3.293-3.293a1 1 0 010-1.414z"
                      clipRule="evenodd"
                    />
                  </svg>
                </button>
              </div>

              <div className="mt-12 grid grid-cols-3 gap-6 text-center text-slate-600 sm:max-w-md sm:text-left">
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">4K</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    Adaptive video clarity
                  </p>
                </div>
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">99.9%</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    uptime commitment
                  </p>
                </div>
                <div>
                  <p className="font-heading text-3xl font-semibold text-slate-900">TLS</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    secure transport
                  </p>
                </div>
              </div>
            </div>

            <div className="relative w-full max-w-lg">
              <div className="absolute -inset-1 rounded-3xl bg-gradient-to-br from-cyan-200 via-sky-200 to-indigo-200 opacity-60 blur-2xl" />
              <div className="relative rounded-[32px] border border-slate-200 bg-white p-6 shadow-[0_25px_60px_-28px_rgba(15,118,110,0.35)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300 to-sky-400 text-sm font-semibold text-white">
                      LIVE
                    </span>
                    <div>
                      <p className="text-sm font-medium text-slate-900">Quarterly briefing</p>
                      <p className="text-xs text-slate-500">CYNAYD Product Studio</p>
                    </div>
                  </div>
                  <span className="rounded-full bg-cyan-50 px-3 py-1 text-xs text-cyan-600">In Progress</span>
                </div>
                <div className="mt-6 grid grid-cols-3 gap-4">
                  {[
                    { label: 'Attendees', value: '24' },
                    { label: 'Recording', value: 'Enabled' },
                    { label: 'Latency', value: 'Low' },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center shadow-[0_12px_24px_-18px_rgba(15,118,110,0.35)]">
                      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{value}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-6 rounded-2xl border border-slate-100 bg-gradient-to-br from-white via-slate-50 to-cyan-50 p-5">
                  <p className="text-sm font-medium text-slate-900">Cinematic mode</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">
                    Adaptive layout, noise suppression, and ambient light compensation powered by CYNAYD Neural Presence™.
                  </p>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

