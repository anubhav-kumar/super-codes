import useOnlineStatus from '../hooks/useOnlineStatus.js';
import Button from './Button.jsx';
import OfflineActionHint from './OfflineActionHint.jsx';

/**
 * Sticky footer for forms: Cancel + primary submit. Must be rendered inside the <form>.
 * Submit is disabled while offline, with OfflineActionHint.
 */
export default function FormFooter({ submitLabel = 'Save', submitting = false, disabled = false, cancelTo, onCancel, cancelLabel = 'Cancel' }) {
    const { online } = useOnlineStatus();
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
            {!online && <OfflineActionHint className="mb-2" />}
            <div className="flex items-center justify-end gap-3">
                {(cancelTo || onCancel) && (
                    <Button variant="secondary" to={cancelTo} onClick={onCancel}>
                        {cancelLabel}
                    </Button>
                )}
                <Button type="submit" loading={submitting} disabled={disabled || !online}>
                    {submitLabel}
                </Button>
            </div>
        </div>
    );
}
