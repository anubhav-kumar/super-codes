import { useCallback, useState } from 'react';
import useOnlineStatus from './useOnlineStatus.js';

export const OFFLINE_SAVE_MESSAGE = "Couldn't save. Check your connection and try again.";

/**
 * Runs a write (all writes are online only in MVP).
 *
 *   const { submit, submitting, formError, fieldErrors, setFieldErrors, clearErrors } = useSubmit();
 *   const result = await submit(() => createThing(body));   // { ok, data, error }
 *
 * Blocks when offline. Maps ApiError to formError (message for the FormError banner) and
 * fieldErrors ({ [field]: message } from the server's error.details).
 */
export default function useSubmit() {
    const { online } = useOnlineStatus();
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
            if (!online) {
                setFormError(OFFLINE_SAVE_MESSAGE);
                return { ok: false, error: null };
            }
            setSubmitting(true);
            try {
                const res = await action();
                return { ok: true, data: res && 'data' in res ? res.data : res, error: null };
            } catch (error) {
                if (error && error.offline) {
                    setFormError(OFFLINE_SAVE_MESSAGE);
                } else {
                    const fields = {};
                    for (const d of (error && error.details) || []) {
                        if (d && d.field && !fields[d.field]) fields[d.field] = d.message;
                    }
                    setFieldErrors(fields);
                    setFormError((error && error.message) || 'Something went wrong');
                }
                return { ok: false, error };
            } finally {
                setSubmitting(false);
            }
        },
        [online]
    );

    return { submit, submitting, formError, fieldErrors, setFormError, setFieldErrors, clearErrors };
}
