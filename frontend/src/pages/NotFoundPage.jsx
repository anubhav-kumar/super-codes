import { Link } from 'react-router-dom';

export default function NotFoundPage() {
    return (
        <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold tracking-widest text-brand-400 uppercase">404</p>
            <h1 className="mt-3 text-3xl font-bold text-white">Page not found</h1>
            <p className="mt-3 text-slate-400">The page you are looking for does not exist.</p>
            <Link
                to="/"
                className="mt-8 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
                Go home
            </Link>
        </main>
    );
}
