import { useEffect, useRef, useState } from 'react';
import { useCompany } from './useCompanies.js';
import { usePerson } from './usePeople.js';

const TYPES = ['PERSON', 'COMPANY'];

/** Reads ?clientType=PERSON|COMPANY&clientId=… into { type, id }, or null when absent or invalid. */
export function readClientPreselect(params) {
    const type = params.get('clientType');
    const id = params.get('clientId');
    return TYPES.includes(type) && id ? { type, id } : null;
}

/**
 * Preselects a client on a create form from the URL (F-18). Loads the person or company once and
 * calls apply({ type, id, name }, record) when it is known. An unknown id (404), an error or no
 * connection leaves the field empty without an error. Returns { loading } for the field.
 */
export default function useClientPreselect(preselect, apply) {
    const type = preselect ? preselect.type : null;
    const id = preselect ? preselect.id : null;
    const person = usePerson(type === 'PERSON' ? id : null);
    const company = useCompany(type === 'COMPANY' ? id : null);
    const res = type === 'PERSON' ? person : company;
    const applyRef = useRef(apply);
    applyRef.current = apply;
    const [done, setDone] = useState(!type);

    useEffect(() => {
        if (done || !type) return;
        if (res.status === 'loaded' && res.data && res.data.id === id) {
            applyRef.current({ type, id, name: res.data.name }, res.data);
            setDone(true);
        } else if (res.status === 'error' || res.status === 'unavailable') {
            setDone(true);
        }
    }, [done, type, id, res.status, res.data]);

    return { loading: !done };
}
