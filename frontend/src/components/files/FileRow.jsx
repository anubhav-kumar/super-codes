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
 * `trailing` holds row actions (open/remove menus come with F-63/F-64). `compact`: 40 px row
 * without uploader and time (inside a comment, P-30).
 */
export default function FileRow({ file, trailing, compact = false, className = '' }) {
    const name = file.fileName || 'Untitled file';
    const meta = [
        fileTypeLabel(file.contentType, name),
        formatFileSize(file.sizeBytes),
        compact ? null : file.uploadedBy && file.uploadedBy.name,
        compact ? null : uploadedLabel(file.uploadedAt),
    ];
    return (
        <div className={`flex items-start gap-3 px-4 ${compact ? 'min-h-10 py-2' : 'min-h-16 py-3'} ${className}`}>
            <span className="flex shrink-0 items-center pt-0.5 text-ink-muted">
                <Icon name={fileKind(file.contentType, name)} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-[15px]/[22px] font-medium break-all text-ink md:text-sm/5">{name}</span>
                <MetaLine items={meta} className="text-sm text-ink-muted md:text-[13px]/[18px]" />
            </span>
            {trailing && <span className="flex shrink-0 items-center gap-1">{trailing}</span>}
        </div>
    );
}
