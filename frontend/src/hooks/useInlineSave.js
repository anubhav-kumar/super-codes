import { useCallback, useRef, useState } from 'react';
import useOnlineStatus from './useOnlineStatus.js';
import { OFFLINE_SAVE_MESSAGE } from './useSubmit.js';
import useToast from './useToast.js';

function text(message, ...args) {
    return typeof message === 'function' ? message(...args) : message;
}

/**
 * Optimistic inline change (a status control, a relationship select).
 *
 *   const status = useInlineSave(order.status);
 *   const result = await status.save(next, () => updateOrder(id, body), {
 *       success: 'Status changed to In Progress',   // string or (data, next) => string
 *       error: "Couldn't change the status",          // optional; defaults to the server message
 *   });                                              // -> { ok, data, error }
 *
 * Shows `next` at once, runs `request`, toasts success; on failure restores the previous value and
 * toasts the error. Offline it does nothing but toast the usual offline message. `value` follows
 * `initial` when it changes (e.g. after a reload) unless a save is running.
 */
export default function useInlineSave(initial) {
    const { online } = useOnlineStatus();
    const toast = useToast();
    const [value, setValue] = useState(initial);
    const [base, setBase] = useState(initial);
    const [saving, setSaving] = useState(false);
    const savingRef = useRef(false);

    if (initial !== base && !saving) {
        setBase(initial);
        setValue(initial);
    }

    const save = useCallback(
        async (next, request, messages = {}) => {
            if (savingRef.current) return { ok: false, data: null, error: null };
            if (!online) {
                toast.error(OFFLINE_SAVE_MESSAGE);
                return { ok: false, data: null, error: null };
            }
            const previous = value;
            savingRef.current = true;
            setSaving(true);
            setValue(next);
            try {
                const res = await request();
                const data = res && typeof res === 'object' && 'data' in res ? res.data : res;
                toast.success(text(messages.success, data, next));
                return { ok: true, data, error: null };
            } catch (error) {
                setValue(previous);
                const message =
                    error && error.offline
                        ? OFFLINE_SAVE_MESSAGE
                        : text(messages.error, error) || (error && error.message) || 'Something went wrong';
                toast.error(message);
                return { ok: false, data: null, error };
            } finally {
                savingRef.current = false;
                setSaving(false);
            }
        },
        [online, toast, value]
    );

    return { value, saving, save };
}
