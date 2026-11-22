import Icon from '../Icon.jsx';

// Same look as Button variant="secondary" size="md"; a plain <a> because tel: and mailto: are not app routes.
const LINK =
    'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink shadow-raised transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-10';

/** "Call" and "Email" buttons of a client profile, each shown only when the value exists. */
export default function ContactActions({ phone, email, className = '' }) {
    if (!phone && !email) return null;
    return (
        <div className={`flex flex-wrap gap-2 ${className}`}>
            {phone && (
                <a href={`tel:${phone.replace(/[^\d+]/g, '')}`} className={LINK} aria-label={`Call ${phone}`}>
                    <Icon name="phone" size="sm" />
                    Call
                </a>
            )}
            {email && (
                <a href={`mailto:${email}`} className={LINK} aria-label={`Email ${email}`}>
                    <Icon name="email" size="sm" />
                    Email
                </a>
            )}
        </div>
    );
}
