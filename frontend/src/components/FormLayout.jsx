import FormError from './FormError.jsx';

/**
 * In-page heading of a form screen: title, optional meta (record number or record name on edit) and
 * a short description. Also used on its own above a form's offline or loading state.
 */
export function FormHeading({ title, meta, description }) {
    return (
        <div className="mb-4 flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h1 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">{title}</h1>
                {meta && <span className="min-w-0 text-sm text-ink-muted tabular-nums">{meta}</span>}
            </div>
            {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
    );
}

/**
 * The one form layout (F-16): heading, form-level error banner(s), grouped FormSections, then the
 * sticky FormFooter. Render inside <PageBody width="form">.
 *   title, meta, description  heading (see FormHeading)
 *   error                     server or network message for the FormError banner (string or array)
 *   onSubmit                  form submit handler (the form is noValidate; validation stays in the page)
 *   footer                    a <FormFooter> (rendered inside the form so its submit button works)
 *   before                    anything shown between the heading and the error banner (e.g. a summary)
 */
export default function FormLayout({ title, meta, description, error, onSubmit, footer, before, children, className = '' }) {
    const errors = (Array.isArray(error) ? error : [error]).filter(Boolean);
    return (
        <div className={className}>
            {title && <FormHeading title={title} meta={meta} description={description} />}
            <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
                {before}
                {errors.map((message) => (
                    <FormError key={message} message={message} />
                ))}
                {children}
                {footer}
            </form>
        </div>
    );
}
