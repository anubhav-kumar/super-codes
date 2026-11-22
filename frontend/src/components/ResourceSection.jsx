import DataView from './DataView.jsx';
import StaleDataNotice from './offline/StaleDataNotice.jsx';
import RelatedSection from './RelatedSection.jsx';

/**
 * A RelatedSection that shows a useResource() result (F-08). Loading, "Not available offline"
 * and errors stay inside the section (compact DataView), so the rest of the page still shows.
 * count: (data) => number. children: (data) => node, rendered only once loaded.
 * `id` is the section anchor (#orders); `footer` renders below the content once loaded.
 */
export default function ResourceSection({ id, title, resource, count, action, footer, className = '', children }) {
    const loaded = resource.status === 'loaded';
    return (
        <RelatedSection id={id} title={title} count={loaded ? count(resource.data) : ''} action={action} className={className}>
            {!loaded ? (
                <div className="px-4 pb-4">
                    <DataView resource={resource} compact />
                </div>
            ) : (
                <>
                    {resource.fromCache && <StaleDataNotice fetchedAt={resource.fetchedAt} className="mx-4 mb-3" />}
                    {children(resource.data)}
                    {footer}
                </>
            )}
        </RelatedSection>
    );
}
