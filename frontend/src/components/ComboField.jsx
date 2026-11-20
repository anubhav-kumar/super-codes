import { useId } from 'react';
import TextField from './TextField.jsx';

/** Free text with suggestions (native <datalist>), e.g. the order's service name. */
export default function ComboField({ suggestions = [], ...rest }) {
    const listId = useId();
    return (
        <>
            <TextField list={listId} autoComplete="off" {...rest} />
            <datalist id={listId}>
                {suggestions.map((s) => (
                    <option key={s} value={s} />
                ))}
            </datalist>
        </>
    );
}
