import { useContext } from 'react';
import ToastContext from '../components/ToastContext.js';

const NOOP = () => {};
const FALLBACK = { success: NOOP, error: NOOP, info: NOOP, dismiss: NOOP };

/**
 * Short confirmations after a save:
 *   const toast = useToast();
 *   toast.success('Order ORD-0003 created', { action: { label: 'Raise invoice', to: '/invoices/new?orderId=…' } });
 *   toast.error("Couldn't save the change");
 * Call it before navigate(): the provider sits above <Routes>, so the toast survives the navigation.
 */
export default function useToast() {
    return useContext(ToastContext) || FALLBACK;
}
