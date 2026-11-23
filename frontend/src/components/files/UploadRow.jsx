import Button from '../Button.jsx';
import Icon from '../Icon.jsx';
import IconButton from '../IconButton.jsx';

/**
 * An upload in progress or failed (F-62), laid out like FileRow. Uploading: thin progress bar +
 * "42%" and a Cancel icon button. Failed: the reason in danger text with Retry and Discard.
 * item: a useFileUploads item. Retry needs a connection (`online`).
 */
export default function UploadRow({ item, onCancel, onRetry, onDiscard, online = true, compact = false, className = '' }) {
    const failed = item.status === 'failed';
    const percent = Math.round((item.progress || 0) * 100);
    return (
        <div className={`flex items-start gap-3 px-4 ${compact ? 'min-h-10 py-2' : 'min-h-16 py-3'} ${className}`}>
            <span className={`flex shrink-0 items-center pt-0.5 ${failed ? 'text-danger' : 'text-ink-muted'}`}>
                <Icon name={failed ? 'alert' : item.kind || 'file'} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-[15px]/[22px] font-medium break-all text-ink md:text-sm/5">{item.name}</span>
                {failed ? (
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span role="alert" className="text-sm text-danger md:text-[13px]/[18px]">
                            {item.error || 'Upload failed'}
                        </span>
                        <span className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={onRetry} disabled={!online} title={online ? undefined : 'Connect to the internet to upload'}>
                                Retry
                            </Button>
                            <Button variant="ghost" size="sm" onClick={onDiscard}>
                                Discard
                            </Button>
                        </span>
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <span
                            role="progressbar"
                            aria-label={`Uploading ${item.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={percent}
                            className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted"
                        >
                            <span className="block h-full rounded-full bg-ink transition-[width]" style={{ width: `${percent}%` }} />
                        </span>
                        <span className="w-10 shrink-0 text-right text-sm text-ink-muted tabular-nums md:text-[13px]/[18px]">{percent}%</span>
                    </span>
                )}
            </span>
            {!failed && <IconButton icon="close" label={`Cancel upload of ${item.name}`} onClick={onCancel} />}
        </div>
    );
}
