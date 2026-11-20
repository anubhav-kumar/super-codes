import { useNavigate } from 'react-router-dom';
import { CLIENT_TABS } from '../constants/clients.js';
import SegmentedControl from './SegmentedControl.jsx';

/** "People / Companies" switch at the top of both client list screens. `value` is '/people' or '/companies'. */
export default function ClientsTabs({ value, className = '' }) {
    const navigate = useNavigate();
    return (
        <SegmentedControl
            label="Clients"
            options={CLIENT_TABS}
            value={value}
            onChange={(to) => to !== value && navigate(to)}
            className={className}
        />
    );
}
