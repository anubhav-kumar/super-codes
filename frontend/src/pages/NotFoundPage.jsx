import Button from '../components/Button.jsx';

export default function NotFoundPage() {
    return (
        <main className="flex h-full flex-col items-center justify-center px-6 text-center">
            <p className="text-sm font-semibold tracking-widest text-ink-subtle uppercase">404</p>
            <h1 className="mt-3 text-2xl font-semibold text-ink">Page not found</h1>
            <p className="mt-2 text-ink-muted">The page you are looking for does not exist.</p>
            <Button to="/" className="mt-8">
                Go home
            </Button>
        </main>
    );
}
