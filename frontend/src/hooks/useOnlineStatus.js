import { useSyncExternalStore } from 'react';
import { getNetworkStatus, subscribeNetworkStatus } from '../offline/network.js';

/** { online, deviceOnline, apiReachable }. `online` is false when the device is offline or the API failed. */
export default function useOnlineStatus() {
    return useSyncExternalStore(subscribeNetworkStatus, getNetworkStatus, getNetworkStatus);
}
