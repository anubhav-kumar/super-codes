import { useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import Sheet from '../Sheet.jsx';
import { formatDateTime } from '../../utils/format.js';

const pad = (n) => String(n).padStart(2, '0');

/** "16:45" when the expiry is today, else "25 Nov 2026, 00:30" (device local time). */
function validUntilText(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return new Date().toDateString() === d.toDateString() ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : formatDateTime(d);
}

export const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'them';

/**
 * A temporary password shown once (FR1 D16, D17, D20): mono, selectable, with Copy and its expiry.
 * The value comes in through props from the parent's component state only: never router state, a
 * URL, storage, a toast or the console. Used in place after Add user (F-49) and in the sheet below.
 */
export function TemporaryPasswordPanel({ name, password, expiresAt }) {
    const [copied, setCopied] = useState(false);
    const [copyFailed, setCopyFailed] = useState(false);
    const valueRef = useRef(null);
    const timer = useRef(null);

    useEffect(() => () => clearTimeout(timer.current), []);

    const selectValue = () => {
        const el = valueRef.current;
        const selection = window.getSelection && window.getSelection();
        if (!el || !selection) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const copy = async () => {
        try {
            if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error('Clipboard unavailable');
            await navigator.clipboard.writeText(password);
            setCopyFailed(false);
            setCopied(true);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopied(false);
            setCopyFailed(true);
            selectValue();
        }
    };

    const until = validUntilText(expiresAt);
    const who = firstName(name);

    return (
        <div className="flex flex-col gap-4">
            <p className="text-sm text-ink-muted">Give this to {who}. They must choose a new password when they sign in.</p>
            <div className="flex flex-col gap-3 rounded-card bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
                <span
                    ref={valueRef}
                    aria-label="Temporary password"
                    className="font-mono text-xl tracking-wider break-all text-ink select-all"
                >
                    {password}
                </span>
                <Button icon={copied ? 'check' : 'copy'} onClick={copy}>
                    {copied ? 'Copied' : 'Copy'}
                </Button>
            </div>
            <p role="status" className="text-sm text-ink-muted">
                {copyFailed ? 'Select and copy the password. ' : ''}
                {until ? `Valid until ${until} (2 hours). ` : 'Valid for 2 hours. '}
                It won&apos;t be shown again.
            </p>
        </div>
    );
}

/**
 * The panel in a Sheet (Reset password, F-51). Closing (Done, Escape, backdrop) calls onClose; the
 * parent then drops the password from its state.
 */
export default function TemporaryPasswordSheet({ open, name, password, expiresAt, onClose }) {
    return (
        <Sheet
            open={open && Boolean(password)}
            title={`Temporary password for ${firstName(name)}`}
            onClose={onClose}
            footer={<Button onClick={onClose}>Done</Button>}
        >
            <TemporaryPasswordPanel name={name} password={password} expiresAt={expiresAt} />
        </Sheet>
    );
}
