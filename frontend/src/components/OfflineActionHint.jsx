/** Muted line shown next to write actions that are disabled while offline. */
export default function OfflineActionHint({ text = 'Connect to the internet to add or edit.', className = '' }) {
    return <p className={`text-sm text-ink-muted ${className}`}>{text}</p>;
}
