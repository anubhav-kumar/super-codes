// Screen-shaped loading states. Blocks use the real heights of the content they stand in for,
// so nothing jumps when the data arrives.

const SECTION = 'overflow-hidden rounded-card border border-line bg-surface';

function Block({ className = '' }) {
    return <div className={`rounded bg-surface-muted ${className}`} />;
}

function Row({ index = 0 }) {
    // Vary the widths a little so the list does not look like a barcode.
    const title = ['w-1/2', 'w-2/5', 'w-3/5'][index % 3];
    const meta = ['w-1/3', 'w-1/4', 'w-2/5'][index % 3];
    return (
        <div className="flex min-h-16 items-center gap-3 px-4 py-3">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Block className={`h-4 ${title}`} />
                <Block className={`h-3 ${meta}`} />
            </div>
            <Block className="h-4 w-16 shrink-0" />
        </div>
    );
}

function Rows({ count, framed = true }) {
    return (
        <div className={`${framed ? SECTION : ''} divide-y divide-line`}>
            {Array.from({ length: count }, (_, i) => (
                <Row key={i} index={i} />
            ))}
        </div>
    );
}

function Chips() {
    return (
        <div className="mb-3 flex gap-2 overflow-hidden">
            {['w-12', 'w-16', 'w-20', 'w-16'].map((w, i) => (
                <Block key={i} className={`h-9 shrink-0 rounded-full ${w}`} />
            ))}
        </div>
    );
}

function Table() {
    return (
        <div className={SECTION}>
            <div className="flex h-10 items-center gap-6 border-b border-line bg-surface-subtle px-4">
                {['w-24', 'w-32', 'w-20', 'w-16'].map((w, i) => (
                    <Block key={i} className={`h-3 ${w} ${i === 3 ? 'ml-auto' : ''}`} />
                ))}
            </div>
            <div className="divide-y divide-line">
                {Array.from({ length: 8 }, (_, i) => (
                    <div key={i} className="flex h-11 items-center gap-6 px-4">
                        <Block className="h-3.5 w-24" />
                        <Block className={`h-3.5 ${i % 2 ? 'w-40' : 'w-32'}`} />
                        <Block className="h-3.5 w-20" />
                        <Block className="ml-auto h-3.5 w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function Field() {
    return (
        <div className="flex flex-col gap-1.5">
            <Block className="h-4 w-24" />
            <Block className="h-11 w-full rounded-control md:h-10" />
        </div>
    );
}

function Detail() {
    return (
        <div className="flex flex-col gap-4 lg:gap-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex flex-col gap-2">
                    <Block className="h-3 w-20" />
                    <Block className="h-7 w-56 max-w-full" />
                    <Block className="h-5 w-40" />
                </div>
                <div className="flex gap-2">
                    <Block className="h-11 w-28 rounded-control md:h-10" />
                    <Block className="h-11 w-11 rounded-control md:h-10 md:w-10" />
                </div>
            </div>
            <div className={`${SECTION} grid grid-cols-2 gap-x-4 gap-y-4 p-4`}>
                {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="flex flex-col gap-1.5">
                        <Block className="h-3 w-16" />
                        <Block className={`h-4 ${i % 2 ? 'w-24' : 'w-32'} max-w-full`} />
                    </div>
                ))}
            </div>
            <div className={SECTION}>
                <div className="flex h-12 items-center px-4">
                    <Block className="h-4 w-28" />
                </div>
                <div className="divide-y divide-line border-t border-line">
                    {Array.from({ length: 2 }, (_, i) => (
                        <Row key={i} index={i} />
                    ))}
                </div>
            </div>
        </div>
    );
}

function Form() {
    return (
        <div className="flex flex-col gap-4">
            <Block className="h-7 w-48" />
            {Array.from({ length: 2 }, (_, s) => (
                <div key={s} className={`${SECTION} flex flex-col gap-4 p-4`}>
                    <Block className="h-4 w-24" />
                    {Array.from({ length: 3 }, (_, f) => (
                        <Field key={f} />
                    ))}
                </div>
            ))}
            <div className="flex justify-end gap-3 border-t border-line pt-3">
                <Block className="h-11 w-24 rounded-control md:h-10" />
                <Block className="h-11 w-24 rounded-control md:h-10" />
            </div>
        </div>
    );
}

function Home() {
    return (
        <div className="flex flex-col gap-4 lg:gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Array.from({ length: 4 }, (_, i) => (
                    <div key={i} className={`${SECTION} flex h-24 flex-col justify-between p-4`}>
                        <Block className="h-3 w-20" />
                        <Block className="h-7 w-16" />
                    </div>
                ))}
            </div>
            <Rows count={3} />
        </div>
    );
}

/**
 * Loading placeholder shaped like the screen:
 *   list   - filter chips + 6 two-line rows (Suspense fallback, list screens)
 *   rows   - `rows` two-line rows only (lists whose chips are already on screen); `framed={false}`
 *            drops the section border for use inside an existing section
 *   table  - header + 8 table rows (desktop tables)
 *   detail - record header + facts grid + one section
 *   form   - title + 2 sections of 3 fields + footer
 *   home   - 4 tiles + 3 rows
 */
export default function PageSkeleton({ variant = 'list', rows = 6, framed = true, className = '' }) {
    let body;
    if (variant === 'rows') body = <Rows count={rows} framed={framed} />;
    else if (variant === 'table') body = <Table />;
    else if (variant === 'detail') body = <Detail />;
    else if (variant === 'form') body = <Form />;
    else if (variant === 'home') body = <Home />;
    else
        body = (
            <>
                <Chips />
                <Rows count={6} />
            </>
        );

    return (
        <div role="status" aria-label="Loading" className={`animate-pulse motion-reduce:animate-none ${className}`}>
            {body}
            <span className="sr-only">Loading</span>
        </div>
    );
}
