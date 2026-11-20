/** Muted line shown next to write actions that are disabled while offline. */
export default function OfflineActionHint({ className = '' }) {
    return <p className={`text-sm text-ink-muted ${className}`}>Connect to the internet to add or edit.</p>;
}
