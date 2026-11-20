import { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import AppShell from './components/AppShell.jsx';
import OfflineBanner from './components/offline/OfflineBanner.jsx';
import UpdatePrompt from './components/offline/UpdatePrompt.jsx';
import PageLoader from './components/PageLoader.jsx';
import RequireAuth from './auth/RequireAuth.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import { ROUTES } from './routes.jsx';

const publicRoutes = ROUTES.filter((r) => r.public);
const privateRoutes = ROUTES.filter((r) => !r.public);

export default function App() {
    return (
        <div className="safe-area flex h-dvh flex-col bg-page font-sans text-ink">
            <OfflineBanner />
            <div className="min-h-0 flex-1">
                <Suspense fallback={<PageLoader fullScreen />}>
                    <Routes>
                        {publicRoutes.map(({ path, Page }) => (
                            <Route key={path} path={path} element={<Page />} />
                        ))}
                        <Route
                            element={
                                <RequireAuth>
                                    <AppShell />
                                </RequireAuth>
                            }
                        >
                            {privateRoutes.map(({ path, Page }) => (
                                <Route key={path} path={path} element={<Page />} />
                            ))}
                        </Route>
                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Suspense>
            </div>
            <UpdatePrompt />
        </div>
    );
}
