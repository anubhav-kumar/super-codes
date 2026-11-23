import Icon from '../Icon.jsx';
import MetaLine from '../MetaLine.jsx';
import { formatDate } from '../../utils/format.js';
import { fileKind, fileTypeLabel, formatFileSize } from './fileRules.js';

const pad = (n) => String(n).padStart(2, '0');

// "23 Nov, 14:05" (year only when not this year), device local time.
function uploadedLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return `${formatDate(d, { short: true })}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * One private file (F-62): kind icon, file name (up to 2 lines, breaks anywhere), meta
 * "PDF · 2.4 MB · Asha Rao · 23 Nov, 14:05". Never shows a preview or a link (files are private).
 * `onOpen` (F-63) makes the icon and name one tap target that opens the file; `opening` shows a
 * spinner while its link is fetched; `online: false` shows "Needs a connection" (tapping still
 * calls `onOpen`, which explains). `trailing` holds row actions (the Open / Remove menu, F-64).
 * `compact`: 40 px row without uploader and time (inside a comment, P-30).
 */
export default function FileRow({ file, trailing, onOpen, opening = false, online = true, compact = false, className = '' }) {
    const name = file.fileName || 'Untitled file';
    const meta = [
        fileTypeLabel(file.contentType, name),
        formatFileSize(file.sizeBytes),
        compact ? null : file.uploadedBy && file.uploadedBy.name,
        compact ? null : uploadedLabel(file.uploadedAt),
    ];
    const rowHeight = compact ? 'min-h-10 py-2' : 'min-h-16 py-3';
    const main = (
        <>
            <span className="flex shrink-0 items-center pt-0.5 text-ink-muted">
                <Icon name={fileKind(file.contentType, name)} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-[15px]/[22px] font-medium break-all text-ink md:text-sm/5">{name}</span>
                <MetaLine items={meta} className="text-sm text-ink-muted md:text-[13px]/[18px]" />
            </span>
        </>
    );
    const status = !onOpen ? null : opening ? (
        <span role="status" aria-label={`Opening ${name}`} className="flex h-5 w-5 items-center justify-center">
            <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-ink-subtle border-r-transparent" />
        </span>
    ) : !online ? (
        <span className="flex items-center gap-1.5 text-sm text-ink-muted md:text-[13px]/[18px]">
            <Icon name="offline" size="sm" />
            <span className="hidden sm:inline">Needs a connection</span>
        </span>
    ) : null;

    if (!onOpen) {
        return (
            <div className={`flex items-start gap-3 px-4 ${rowHeight} ${className}`}>
                {main}
                {trailing && <span className="flex shrink-0 items-center gap-1">{trailing}</span>}
            </div>
        );
    }
    return (
        <div className={`flex items-stretch ${className}`}>
            <button
                type="button"
                onClick={onOpen}
                aria-busy={opening || undefined}
                title={online ? `Open ${name}` : 'Opening files needs a connection'}
                className={`flex min-w-0 flex-1 items-start gap-3 pl-4 text-left hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${trailing ? 'pr-2' : 'pr-4'} ${rowHeight}`}
            >
                {main}
                {status && <span className="flex shrink-0 items-center self-center">{status}</span>}
            </button>
            {trailing && <span className="flex shrink-0 items-center gap-1 pr-2">{trailing}</span>}
        </div>
    );
}
