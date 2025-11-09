import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';

export default function Register() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await register(name, email, password);
      toast.success('Account created successfully');
      navigate('/');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f7f9fc] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-150px] top-[-120px] h-[420px] w-[420px] rounded-full bg-gradient-to-br from-cyan-100 via-sky-100 to-indigo-100 opacity-70 blur-[150px]" />
        <div className="absolute right-[-120px] bottom-[-160px] h-[480px] w-[480px] rounded-full bg-gradient-to-tl from-white via-cyan-100 to-indigo-100 opacity-60 blur-[170px]" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col justify-center px-6 py-12 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-white px-4 py-1 text-[11px] uppercase tracking-[0.4em] text-cyan-500 shadow-[0_12px_32px_-22px_rgba(14,165,233,0.55)]">
              CYNAYD Connect
            </div>
            <div className="space-y-5">
              <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                Join the premium collaboration studio.
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-slate-600">
                Create your CYNAYD Connect profile to host cinematic meetings, synchronize content, and deliver experiences your clients remember.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:max-w-lg">
              {[
                { title: 'Personalized lobbies', description: 'Craft bespoke waiting rooms with branded assets.' },
                { title: 'Shared intelligence', description: 'AI summaries and follow-ups available after every call.' },
              ].map(({ title, description }) => (
                <div key={title} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_18px_45px_-28px_rgba(14,165,233,0.45)]">
                  <p className="text-sm font-semibold text-slate-900">{title}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-500">{description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[34px] border border-slate-200 bg-white/95 p-8 shadow-[0_30px_70px_-38px_rgba(14,165,233,0.45)] backdrop-blur">
            <div className="space-y-3 text-center sm:text-left">
              <p className="text-xs uppercase tracking-[0.35em] text-cyan-500">Create account</p>
              <h2 className="text-2xl font-semibold text-slate-900">Begin your CYNAYD journey</h2>
              <p className="text-sm text-slate-500">
                Already have credentials?{' '}
                <Link to="/login" className="font-semibold text-cyan-600 hover:text-cyan-500">
                  Sign in instead
                </Link>
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label htmlFor="name" className="mb-2 block text-sm font-medium text-slate-600">
                    Full name
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <svg className="h-4 w-4 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 2a4 4 0 014 4v1a4 4 0 01-8 0V6a4 4 0 014-4z" />
                        <path fillRule="evenodd" d="M4 13a4 4 0 014-4h4a4 4 0 014 4v1.5A1.5 1.5 0 0114.5 20h-9A1.5 1.5 0 014 17.5V13z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input
                      id="name"
                      name="name"
                      type="text"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full rounded-[18px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="Naomi Wu"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="email-address" className="mb-2 block text-sm font-medium text-slate-600">
                    Email address
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <svg className="h-4 w-4 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2.94 6.339A2 2 0 014.64 5h10.72a2 2 0 011.7 1.339l-.02.028L10 10.882 2.94 6.367l.001-.028z" />
                        <path d="M2 7.697V14a2 2 0 002 2h12a2 2 0 002-2V7.697l-7.12 4.27a1 1 0 01-1.04 0L2 7.697z" />
                      </svg>
                    </div>
                    <input
                      id="email-address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-[18px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="you@cynayd.studio"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-600">
                    Password
                  </label>
                  <div className="relative">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                      <svg className="h-4 w-4 text-cyan-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 2a5 5 0 00-5 5v2H4a2 2 0 00-2 2v5h2.5v2h11v-2H18v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full rounded-[18px] border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-cyan-300 focus:outline-none focus:ring-2 focus:ring-cyan-200"
                      placeholder="Create a secure password"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="group relative inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-[22px] bg-gradient-to-r from-cyan-400 via-sky-500 to-indigo-500 px-6 py-3 text-sm font-semibold text-white shadow-[0_22px_48px_-26px_rgba(14,165,233,0.65)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoading ? 'Creating account...' : 'Create account'}
                <span className="absolute inset-0 opacity-0 transition group-hover:opacity-100 group-hover:blur-md">
                  <span className="absolute inset-0 bg-gradient-to-r from-cyan-200 via-sky-300 to-indigo-300" />
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

