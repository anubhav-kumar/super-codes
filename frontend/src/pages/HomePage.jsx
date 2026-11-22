import AppMark from '../components/AppMark.jsx';
import DataView from '../components/DataView.jsx';
import HomeFigures from '../components/home/HomeFigures.jsx';
import NeedsAttention from '../components/home/NeedsAttention.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useFirmSummary from '../hooks/useFirmSummary.js';

/**
 * Home: the firm summary (F-20). Key figures that open the filtered lists, then "Needs attention"
 * (most urgent overdue invoices and orders). Readable offline from the last load (stale notice).
 *
 * Layout: phones stack everything; lg+ puts the figures in one row, then Needs attention (2/3)
 * beside an aside column (1/3). F-21 adds Quick actions (phones: between the figures and Needs
 * attention; lg+: top of the aside) and Recently opened (phones: last; lg+: aside) via `aside`.
 */
export default function HomePage() {
    const summary = useFirmSummary();
    const aside = null; // F-21: quick actions + recently opened

    return (
        <PageBody width="detail">
            <PageHeader
                title="Home"
                titleSlot={
                    <span className="flex items-center gap-2">
                        <AppMark size={24} className="md:hidden" />
                        <span aria-hidden="true" className="text-base font-semibold text-ink md:text-lg">
                            Home
                        </span>
                    </span>
                }
            />

            <DataView resource={summary} skeleton="home">
                {(data) => (
                    <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
                        <HomeFigures summary={data} className="lg:col-span-3" />
                        <NeedsAttention summary={data} className={aside ? 'lg:col-span-2' : 'lg:col-span-3'} />
                        {aside && <div className="flex flex-col gap-4 lg:gap-6">{aside}</div>}
                    </div>
                )}
            </DataView>
        </PageBody>
    );
}
