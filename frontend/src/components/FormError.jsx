import Icon from './Icon.jsx';

/** Banner at the top of a form for server or network errors. Renders nothing without a message. */
export default function FormError({ message, className = '' }) {
    if (!message) return null;
    return (
        <div role="alert" className={`flex items-start gap-2 rounded-control bg-danger-bg px-3 py-2.5 text-sm text-danger ${className}`}>
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{message}</p>
        </div>
    );
}
