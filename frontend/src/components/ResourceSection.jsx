import DataView from './DataView.jsx';
import StaleDataNotice from './offline/StaleDataNotice.jsx';
import RelatedSection from './RelatedSection.jsx';

/**
 * A RelatedSection that loads its own useResource() result (F-08). Loading, "Not available offline"
 * and errors stay inside the section (compact DataView), so the rest of the page still shows.
 * count: (data) => number. children: (data) => node, rendered only once loaded.
 */
export default function ResourceSection({ title, resource, count, action, className = '', children }) {
    const loaded = resource.status === 'loaded';
    return (
        <RelatedSection title={title} count={loaded ? count(resource.data) : ''} action={action} className={className}>
            {!loaded ? (
                <div className="px-4 pb-4">
                    <DataView resource={resource} compact />
                </div>
            ) : (
                <>
                    {resource.fromCache && <StaleDataNotice fetchedAt={resource.fetchedAt} className="mx-4 mb-3" />}
                    {children(resource.data)}
                </>
            )}
        </RelatedSection>
    );
}
