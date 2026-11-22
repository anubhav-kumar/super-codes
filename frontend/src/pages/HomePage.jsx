import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import Icon from '../components/Icon.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import InstallButton from '../components/offline/InstallButton.jsx';
import useAuth from '../hooks/useAuth.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { sortedNavItems } from '../navigation.js';

/** Signed-in Home: greeting, then one card per navigation section (read from NAV_ITEMS). */
export default function HomePage() {
    const { user } = useAuth();
    const { online } = useOnlineStatus();
    const sections = sortedNavItems().filter((item) => item.id !== 'home');
    const hasQuickActions = sections.some((item) => item.quickAction);

    return (
        <>
            <PageHeader title="Home" subtitle={user ? `Signed in as ${user.email}` : undefined} actions={<InstallButton />} />

            {sections.length === 0 ? (
                <Card>
                    <p className="text-sm text-ink-muted">Sections such as Clients, Orders and Invoices appear here as they are added.</p>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                    {sections.map((item) => (
                        <Card
                            key={item.id}
                            title={
                                <span className="flex items-center gap-2">
                                    <Icon name={item.icon} size="md" className="text-ink-subtle" />
                                    {item.label}
                                </span>
                            }
                        >
                            {item.description && <p className="text-sm text-ink-muted">{item.description}</p>}
                            <div className="flex flex-wrap gap-2">
                                <Button variant="secondary" size="sm" to={item.to}>
                                    Open {item.label}
                                </Button>
                                {item.quickAction && (
                                    <Button size="sm" icon="plus" to={item.quickAction.to} disabled={!online}>
                                        {item.quickAction.label}
                                    </Button>
                                )}
                            </div>
                        </Card>
                    ))}
                </div>
            )}

            {hasQuickActions && !online && <OfflineActionHint className="mt-4" />}
        </>
    );
}
