import HealthIndicator from '../components/HealthIndicator.jsx';
import InstallButton from '../components/offline/InstallButton.jsx';
import { APP_NAME } from '../config.js';
import useHealth from '../hooks/useHealth.js';

export default function HomePage() {
    const health = useHealth();

    return (
        <main className="relative isolate flex min-h-dvh flex-col overflow-hidden px-6">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500/30 blur-3xl" />
                <div className="absolute -bottom-40 -right-20 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-size-[24px_24px]" />
            </div>

            <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center py-16 text-center">
                <span className="mb-6 inline-flex items-center rounded-full bg-brand-500/10 px-3 py-1 text-xs font-semibold tracking-widest text-brand-400 uppercase ring-1 ring-brand-500/30">
                    Coming soon
                </span>
                <h1 className="bg-linear-to-b from-white to-slate-400 bg-clip-text text-5xl font-extrabold tracking-tight text-transparent sm:text-6xl">
                    {APP_NAME}
                </h1>
                <p className="mt-5 max-w-md text-base text-slate-400 sm:text-lg">
                    We are building something new. Check back soon.
                </p>

                <div className="mt-10 flex flex-col items-center gap-4">
                    <HealthIndicator status={health.status} serverTimestamp={health.serverTimestamp} onRetry={health.refresh} />
                    <InstallButton />
                </div>
            </div>

            <footer className="pb-6 text-center text-xs text-slate-600">
                © {new Date().getFullYear()} {APP_NAME}
            </footer>
        </main>
    );
}
