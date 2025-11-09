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
    <div className="min-h-screen bg-[#f7f9fc] text-slate-900">
      <div className="relative overflow-hidden">
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
                <p className="text-xs uppercase tracking-[0.45em] text-slate-500">CYNAYD</p>
                <h1 className="text-xl font-semibold tracking-wide text-slate-900">Connect</h1>
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

        <main className="relative z-10">
          <section className="mx-auto flex max-w-6xl flex-col gap-16 px-6 pb-16 pt-16 sm:px-8 lg:flex-row lg:items-center lg:justify-between lg:gap-24 lg:pb-24 lg:pt-24">
            <div className="max-w-xl">
              <p className="inline-flex items-center rounded-full border border-cyan-200 bg-white px-4 py-1 text-xs uppercase tracking-[0.4em] text-cyan-500 shadow-[0_10px_30px_-18px_rgba(14,165,233,0.7)]">
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
                  className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_18px_36px_-16px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/60"
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
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:border-cyan-200 hover:bg-cyan-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200"
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
                  <p className="text-3xl font-semibold text-slate-900">4K</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    Adaptive video clarity
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-semibold text-slate-900">99.9%</p>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    uptime commitment
                  </p>
                </div>
                <div>
                  <p className="text-3xl font-semibold text-slate-900">TLS</p>
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

          <section className="mx-auto max-w-6xl px-6 pb-24 sm:px-8 lg:pb-32">
            <div className="rounded-[34px] border border-slate-200 bg-white p-10 shadow-[0_25px_60px_-30px_rgba(15,118,110,0.35)]">
              <div className="grid gap-10 lg:grid-cols-3">
                {[
                  {
                    title: 'Immersive presence',
                    description:
                      'Spatial audio and automatic framing mimic in-person collaboration, keeping attention where it matters.',
                    icon: (
                      <svg className="h-6 w-6 text-cyan-500" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 4.5C7.85787 4.5 4.5 7.85787 4.5 12C4.5 16.1421 7.85787 19.5 12 19.5C16.1421 19.5 19.5 16.1421 19.5 12C19.5 10.7333 19.1875 9.5471 18.6345 8.51187"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M8.25 12C8.25 14.0711 9.92893 15.75 12 15.75C14.0711 15.75 15.75 14.0711 15.75 12C15.75 9.92893 14.0711 8.25 12 8.25"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M19.5 7.5V4.5H16.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                  },
                  {
                    title: 'Enterprise-grade trust',
                    description:
                      'Zero-knowledge encryption, SOC 2 compliance, and dedicated regions for regulated industries.',
                    icon: (
                      <svg className="h-6 w-6 text-cyan-500" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 4L19.5 7.5V12.75C19.5 17.25 16.065 21.36 12 22.5C7.935 21.36 4.5 17.25 4.5 12.75V7.5L12 4Z"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9.75 12.75L11.25 14.25L14.25 10.5"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                  },
                  {
                    title: 'Effortless orchestration',
                    description:
                      'Smart lobby, instant breakout rooms, and AI notes so moderators can focus on people, not panels.',
                    icon: (
                      <svg className="h-6 w-6 text-cyan-500" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M6.75 9H4.5V19.5H19.5V9H17.25"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M9 12.75L12 15.75L15 12.75"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M12 4.5V15.75"
                          stroke="currentColor"
                          strokeWidth="1.7"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ),
                  },
                ].map(({ title, description, icon }) => (
                  <div key={title} className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-[0_20px_45px_-28px_rgba(15,118,110,0.35)]">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-[0_15px_30px_-25px_rgba(15,118,110,0.35)]">
                      {icon}
                    </div>
                    <h3 className="mt-6 text-lg font-semibold text-slate-900">{title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-12 grid gap-10 lg:grid-cols-[1.3fr_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-8 shadow-[0_25px_55px_-30px_rgba(15,118,110,0.35)]">
                  <p className="text-sm uppercase tracking-[0.4em] text-cyan-500">Testimonials</p>
                  <blockquote className="mt-5 space-y-6 text-slate-700">
                    <p className="text-lg font-medium leading-relaxed">
                      “CYNAYD Connect gives us the polish our clients expect. The cinematic presence mode is unreal—our remote workshops feel exactly like being there.”
                    </p>
                    <footer className="text-sm text-slate-500">
                      Naomi Wu · Global Experience Lead, Northwind Studio
                    </footer>
                  </blockquote>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-[0_25px_55px_-30px_rgba(15,118,110,0.35)]">
                  <p className="text-sm uppercase tracking-[0.4em] text-cyan-500">Integrations</p>
                  <ul className="mt-5 space-y-3 text-sm text-slate-600">
                    <li className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span>Slack Huddles Sync</span>
                      <span className="text-xs uppercase tracking-wide text-cyan-500">Live</span>
                    </li>
                    <li className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span>Notion Documentation</span>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Beta</span>
                    </li>
                    <li className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <span>Figma Canvas Share</span>
                      <span className="text-xs uppercase tracking-wide text-slate-500">Coming Soon</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="relative z-10 border-t border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-slate-500 sm:flex-row sm:px-8">
            <p>© {new Date().getFullYear()} CYNAYD Connect. Crafted for premium collaboration.</p>
            <div className="flex items-center gap-6">
              <button
                onClick={handleCreateRoom}
                className="text-slate-600 transition hover:text-cyan-500"
              >
                Launch a session
              </button>
              <button
                onClick={handleJoinRoom}
                className="text-slate-600 transition hover:text-cyan-500"
              >
                Join instantly
              </button>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

