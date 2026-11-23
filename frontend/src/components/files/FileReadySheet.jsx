import Button from '../Button.jsx';
import Icon from '../Icon.jsx';
import Sheet from '../Sheet.jsx';

/**
 * Fallback when the browser blocked the file tab (F-63): the file name and an "Open file" link.
 * The link lives only while this sheet is open; following it or closing the sheet drops it.
 */
export default function FileReadySheet({ fileName, url, onClose }) {
    // Close after the click has started the navigation, not during it.
    const onFollow = () => setTimeout(onClose, 0);
    return (
        <Sheet
            open
            title="File ready"
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onFollow}
                        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control bg-accent px-4 text-sm font-medium text-on-accent transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-10"
                    >
                        Open file
                    </a>
                </>
            }
        >
            <div className="flex items-start gap-3">
                <span className="flex shrink-0 items-center pt-0.5 text-ink-muted">
                    <Icon name="file" />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                    <span className="line-clamp-2 text-[15px]/[22px] font-medium break-all text-ink md:text-sm/5">{fileName}</span>
                    <span className="text-sm text-ink-muted">This link works for 5 minutes.</span>
                </span>
            </div>
        </Sheet>
    );
}
