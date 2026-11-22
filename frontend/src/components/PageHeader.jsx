import { useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import useMediaQuery from '../hooks/useMediaQuery.js';
import Icon from './Icon.jsx';
import IconButton from './IconButton.jsx';
import SearchInput from './SearchInput.jsx';
import ShellHeaderContext from './ShellHeaderContext.js';

function BackButton({ backTo, backLabel }) {
    const navigate = useNavigate();
    const goBack = () => {
        // History back when the previous entry is inside the app, otherwise the parent with replace.
        if (window.history.state && window.history.state.idx > 0) navigate(-1);
        else navigate(backTo, { replace: true });
    };
    return (
        <button
            type="button"
            onClick={goBack}
            aria-label={`Back to ${backLabel}`}
            className="-ml-1 inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-control px-1 text-sm font-medium text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-9 md:justify-start md:pr-3 md:pl-1.5"
        >
            <Icon name="back" />
            <span className="hidden md:inline">{backLabel}</span>
        </button>
    );
}

/**
 * Fills the shell's top bar (it renders nothing in the page body).
 *   Top-level lists: <PageHeader title="Orders" actions={...} search={{ value, onChange, placeholder }} />
 *   Inner screens:   <PageHeader backTo="/orders" backLabel="Orders" />  (the record or form title stays in the page)
 * `titleSlot` replaces the visible title (e.g. the People / Companies switch); `title` then stays as a
 * screen-reader heading. Search: inline 280 px field on md+; on phones a search button that opens
 * the field over the title (an active query keeps it open).
 * Renders nothing until AppShell has mounted the slot, so the title never flashes in the body.
 */
export default function PageHeader({ title, titleSlot, backTo, backLabel = 'Back', actions, search }) {
    const slot = useContext(ShellHeaderContext);
    const desktop = useMediaQuery('(min-width: 768px)');
    const [searchOpen, setSearchOpen] = useState(false);
    if (!slot) return null;

    const searchActive = Boolean(search && search.value);
    const phoneSearch = Boolean(search) && !desktop && (searchOpen || searchActive);

    const content = phoneSearch ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
            {title && <h1 className="sr-only">{title}</h1>}
            <SearchInput
                value={search.value}
                onChange={search.onChange}
                placeholder={search.placeholder}
                className="min-w-0 flex-1"
                autoFocus
            />
            <IconButton
                label="Close search"
                icon="close"
                onClick={() => {
                    search.onChange('');
                    setSearchOpen(false);
                }}
            />
        </div>
    ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2">
            {backTo && <BackButton backTo={backTo} backLabel={backLabel} />}
            {titleSlot ? (
                <>
                    {title && <h1 className="sr-only">{title}</h1>}
                    <div className="min-w-0">{titleSlot}</div>
                </>
            ) : (
                title && <h1 className="min-w-0 truncate text-base font-semibold text-ink md:text-lg">{title}</h1>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
                {search &&
                    (desktop ? (
                        <SearchInput
                            value={search.value}
                            onChange={search.onChange}
                            placeholder={search.placeholder}
                            className="w-[280px]"
                        />
                    ) : (
                        <IconButton label="Search" icon="search" onClick={() => setSearchOpen(true)} />
                    ))}
                {actions}
            </div>
        </div>
    );

    return createPortal(content, slot);
}
