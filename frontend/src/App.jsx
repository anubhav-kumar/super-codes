import { Route, Routes } from 'react-router-dom';
import OfflineBanner from './components/offline/OfflineBanner.jsx';
import UpdatePrompt from './components/offline/UpdatePrompt.jsx';
import HomePage from './pages/HomePage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
    return (
        <div className="safe-area min-h-dvh bg-slate-950 font-sans text-slate-100">
            <OfflineBanner />
            <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="*" element={<NotFoundPage />} />
            </Routes>
            <UpdatePrompt />
        </div>
    );
}
