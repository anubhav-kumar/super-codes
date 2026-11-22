import useOnlineStatus from '../hooks/useOnlineStatus.js';
import Button from './Button.jsx';
import OfflineActionHint from './OfflineActionHint.jsx';

/**
 * Sticky footer for forms: Cancel, optional secondary submit, primary submit. Must be rendered inside
 * the <form>. Submit buttons are disabled while offline, with OfflineActionHint.
 *   secondarySubmit  { label, onClick, loading } — e.g. "Save as draft" next to "Issue invoice".
 *                    A plain button (type="button"); onClick runs the page's own save path.
 * On phones the bar bleeds to the PageBody gutters (16 px); from md it is exactly the form width, so
 * its edges line up with the FormSection cards.
 */
export default function FormFooter({
    submitLabel = 'Save',
    submitting = false,
    disabled = false,
    cancelTo,
    onCancel,
    cancelLabel = 'Cancel',
    secondarySubmit,
}) {
    const { online } = useOnlineStatus();
    const secondaryLoading = Boolean(secondarySubmit && secondarySubmit.loading);
    const blocked = disabled || !online;
    return (
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:mx-0 md:px-0">
            {!online && <OfflineActionHint className="mb-2" />}
            <div className="flex flex-wrap items-center justify-end gap-3">
                {(cancelTo || onCancel) && (
                    <Button variant="secondary" to={cancelTo} onClick={onCancel}>
                        {cancelLabel}
                    </Button>
                )}
                {secondarySubmit && (
                    <Button variant="secondary" onClick={secondarySubmit.onClick} loading={secondaryLoading} disabled={blocked || submitting}>
                        {secondarySubmit.label}
                    </Button>
                )}
                <Button type="submit" loading={submitting} disabled={blocked || secondaryLoading}>
                    {submitLabel}
                </Button>
            </div>
        </div>
    );
}
