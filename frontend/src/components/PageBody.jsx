// Content widths: list = tables up to 1536 px, detail = 1152 px, form = 672 px, narrow = 480 px.
const WIDTHS = {
    list: 'max-w-[96rem]',
    detail: 'max-w-6xl',
    form: 'max-w-2xl',
    narrow: 'max-w-[30rem]',
};

/** Page content wrapper: gutters (16 / 24 / 32 px) and the content width for the kind of screen. */
export default function PageBody({ width = 'list', className = '', children }) {
    return (
        <div className={`mx-auto w-full px-4 py-4 md:px-6 md:py-6 xl:px-8 ${WIDTHS[width] || WIDTHS.list} ${className}`}>
            {children}
        </div>
    );
}
