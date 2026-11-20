import { useCallback, useEffect, useState } from 'react';

const isStandalone = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true);

/** Captures Chrome's beforeinstallprompt so the app can show its own "Install app" button. */
export default function useInstallPrompt() {
    const [deferred, setDeferred] = useState(null);
    const [installed, setInstalled] = useState(isStandalone);

    useEffect(() => {
        const onPrompt = (event) => {
            event.preventDefault();
            setDeferred(event);
        };
        const onInstalled = () => {
            setInstalled(true);
            setDeferred(null);
        };
        window.addEventListener('beforeinstallprompt', onPrompt);
        window.addEventListener('appinstalled', onInstalled);
        return () => {
            window.removeEventListener('beforeinstallprompt', onPrompt);
            window.removeEventListener('appinstalled', onInstalled);
        };
    }, []);

    const promptInstall = useCallback(async () => {
        if (!deferred) return;
        deferred.prompt();
        const { outcome } = await deferred.userChoice;
        if (outcome === 'accepted') setInstalled(true);
        setDeferred(null);
    }, [deferred]);

    return { canInstall: Boolean(deferred) && !installed, installed, promptInstall };
}
