import Badge from '../Badge.jsx';
import { ORDER_STATUS_TONE, orderStatusLabel } from '../../constants/orders.js';

/** Order status pill with the usual status tones, for timeline sentences and status lines. */
export default function StatusBadge({ status }) {
    if (!status) return null;
    return (
        <Badge tone={ORDER_STATUS_TONE[status]} className="align-middle">
            {orderStatusLabel(status)}
        </Badge>
    );
}
