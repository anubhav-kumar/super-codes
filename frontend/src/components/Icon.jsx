/** Inline SVG icons by name (24 px grid, stroke style). Decorative unless `title` is given. */
const PATHS = {
    home: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
    clients: [
        'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20',
        'M9 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7z',
        'M22 20v-1.5a4 4 0 0 0-3-3.87',
        'M16 3.63a3.5 3.5 0 0 1 0 6.74',
    ],
    orders: [
        'M9 3.5h6a1 1 0 0 1 1 1V6H8V4.5a1 1 0 0 1 1-1z',
        'M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2',
        'M9 12h6',
        'M9 16h4',
    ],
    invoices: ['M6 3h12v18l-3-2-3 2-3-2-3 2z', 'M9 8h6', 'M9 12h6', 'M9 16h3'],
    workers: [
        'M4 7h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z',
        'M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
        'M3 13h18',
    ],
    search: ['M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14z', 'M20 20l-4-4'],
    plus: ['M12 5v14', 'M5 12h14'],
    edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13.5 6.5l4 4'],
    back: ['M15 5l-7 7 7 7'],
    'chevron-right': ['M9 5l7 7-7 7'],
    more: ['M12 5.5h.01', 'M12 12h.01', 'M12 18.5h.01'],
    'sign-out': ['M10 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4', 'M16 16l4-4-4-4', 'M20 12H10'],
    offline: [
        'M3 3l18 18',
        'M8.5 16.5a5 5 0 0 1 7 0',
        'M5 12.5a10 10 0 0 1 5.2-2.8',
        'M19 12.5a10 10 0 0 0-2.4-1.7',
        'M2 8.8a15 15 0 0 1 4.2-2.6',
        'M22 8.8A15 15 0 0 0 11 5',
        'M12 20h.01',
    ],
    check: ['M5 12.5l4.5 4.5L19 7'],
    close: ['M6 6l12 12', 'M18 6L6 18'],
    alert: ['M12 3.5 21.5 20h-19z', 'M12 10v4', 'M12 17h.01'],
    link: [
        'M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1',
        'M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1',
    ],
    eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6z'],
    'eye-off': [
        'M3 3l18 18',
        'M10.6 5.1A10.8 10.8 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.9 3.9',
        'M6.6 6.6C3.7 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6',
        'M9.9 9.9a3 3 0 0 0 4.2 4.2',
    ],
    download: ['M12 4v11', 'M7 10l5 5 5-5', 'M5 20h14'],
    history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
    user: ['M12 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z', 'M4 20a8 8 0 0 1 16 0'],
};

export default function Icon({ name, className = 'h-5 w-5', title }) {
    const paths = PATHS[name];
    if (!paths) return null;
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={name === 'more' ? 2.6 : 1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
            aria-hidden={title ? undefined : 'true'}
            role={title ? 'img' : undefined}
        >
            {title && <title>{title}</title>}
            {paths.map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
