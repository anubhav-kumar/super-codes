import { useCallback, useState } from 'react';
import useOnlineStatus from './useOnlineStatus.js';
import useToast from './useToast.js';

export const OFFLINE_SAVE_MESSAGE = "Couldn't save. Check your connection and try again.";

/**
 * Runs a write (all writes are online only in MVP).
 *
 *   const { submit, submitting, formError, fieldErrors, setFieldErrors, clearErrors } = useSubmit();
 *   const result = await submit(() => createThing(body));   // { ok, data, error }
 *
 * Blocks when offline. Maps ApiError to formError (message for the FormError banner) and
 * fieldErrors ({ [field]: message } from the server's error.details).
 *
 * `useSubmit({ errorToast: true })` (forms, F-15) also raises one error toast per failed save,
 * with the same message as the banner. Success toasts are raised by the page, which knows the record.
 */
export default function useSubmit({ errorToast = false } = {}) {
    const { online } = useOnlineStatus();
    const toast = useToast();
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState(null);
    const [fieldErrors, setFieldErrors] = useState({});

    const clearErrors = useCallback(() => {
        setFormError(null);
        setFieldErrors({});
    }, []);

    const submit = useCallback(
        async (action) => {
            setFormError(null);
            setFieldErrors({});
            const fail = (message) => {
                setFormError(message);
                if (errorToast) toast.error(message);
            };
            if (!online) {
                fail(OFFLINE_SAVE_MESSAGE);
                return { ok: false, error: null };
            }
            setSubmitting(true);
            try {
                const res = await action();
                return { ok: true, data: res && 'data' in res ? res.data : res, error: null };
            } catch (error) {
                if (error && error.offline) {
                    fail(OFFLINE_SAVE_MESSAGE);
                } else {
                    const fields = {};
                    for (const d of (error && error.details) || []) {
                        if (d && d.field && !fields[d.field]) fields[d.field] = d.message;
                    }
                    setFieldErrors(fields);
                    fail((error && error.message) || 'Something went wrong');
                }
                return { ok: false, error };
            } finally {
                setSubmitting(false);
            }
        },
        [online, errorToast, toast]
    );

    return { submit, submitting, formError, fieldErrors, setFormError, setFieldErrors, clearErrors };
}
