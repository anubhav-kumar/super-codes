import AppMark from '../components/AppMark.jsx';
import DataView from '../components/DataView.jsx';
import HomeFigures from '../components/home/HomeFigures.jsx';
import MemberHome, { MemberHomeFigures } from '../components/home/MemberHome.jsx';
import NeedsAttention from '../components/home/NeedsAttention.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import QuickActions from '../components/home/QuickActions.jsx';
import RecentlyOpened from '../components/home/RecentlyOpened.jsx';
import useFirmSummary from '../hooks/useFirmSummary.js';
import useRole from '../hooks/useRole.js';

/**
 * Lays out Home. Phones: one column in the order figures, quick actions, needs attention, recently
 * opened. lg+: figures in one row, then `main` (2/3) beside quick actions + recently opened (1/3).
 * The aside uses `display: contents` on phones so its two blocks can be ordered around `main`.
 * `quickActions` is false for members (every quick action is an admin action).
 */
function HomeLayout({ figures, main, quickActions = true }) {
    return (
        <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:items-start lg:gap-6">
            {figures && <div className="order-1 lg:col-span-3">{figures}</div>}
            <div className="order-3 lg:order-2 lg:col-span-2">{main}</div>
            <div className="contents lg:order-3 lg:flex lg:flex-col lg:gap-6">
                {quickActions && <QuickActions className="order-2" />}
                <RecentlyOpened className="order-4" />
            </div>
        </div>
    );
}

/**
 * Home: the firm summary (F-20) with quick actions and recently opened (F-21). Key figures open
 * the filtered lists; "Needs attention" lists the most urgent overdue invoices and orders.
 * Readable offline from the last load (stale notice). When the summary is not available offline
 * (or fails), the message takes the main column and quick actions (disabled offline) and recently
 * opened stay visible.
 *
 * Members (P-26 F-58): their own order counts, overdue orders and orders by status (MemberHome);
 * no firm money figures and no quick actions. The layout is chosen by role, never by the response
 * shape. Without a linked Worker the figures show zeros and NoWorkerState takes the main column.
 */
export default function HomePage() {
    const summary = useFirmSummary();
    const { isAdmin, hasWorker } = useRole();

    const loaded = (data) =>
        isAdmin ? (
            <HomeLayout figures={<HomeFigures summary={data} />} main={<NeedsAttention summary={data} />} />
        ) : (
            <HomeLayout
                quickActions={false}
                figures={<MemberHomeFigures summary={data} hasWorker={hasWorker} />}
                main={<MemberHome summary={data} hasWorker={hasWorker} />}
            />
        );

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

            {summary.status === 'loading' || summary.status === 'loaded' ? (
                <DataView resource={summary} skeleton="home">
                    {loaded}
                </DataView>
            ) : (
                <HomeLayout quickActions={isAdmin} main={<DataView resource={summary} skeleton="home" />} />
            )}
        </PageBody>
    );
}
