import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    ArrowUpDown,
    Building2,
    Calendar,
    Check,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    CircleAlert,
    CircleCheck,
    CircleUser,
    ClipboardList,
    Clock,
    Copy,
    Download,
    Ellipsis,
    Eye,
    EyeOff,
    FilePlus2,
    FileText,
    History,
    IdCard,
    KeyRound,
    Info,
    LayoutDashboard,
    Link,
    LogOut,
    Mail,
    MessageSquare,
    PanelLeftClose,
    PanelLeftOpen,
    Pencil,
    Phone,
    Plus,
    RefreshCw,
    Search,
    SearchX,
    Send,
    ShieldCheck,
    Trash2,
    TriangleAlert,
    Unlink,
    User,
    UserPlus,
    UserX,
    Users,
    UsersRound,
    Wallet,
    WifiOff,
    X,
} from 'lucide-react';

/**
 * The one icon family (lucide-react). Pages use <Icon name="..."> and never import lucide directly;
 * add a missing icon here. Old names (user, download, history) stay as aliases.
 */
const ICONS = {
    home: LayoutDashboard,
    clients: Users,
    person: User,
    company: Building2,
    orders: ClipboardList,
    invoices: FileText,
    workers: IdCard,
    payment: Wallet,
    'raise-invoice': FilePlus2,
    issue: Send,
    due: Calendar,
    'due-soon': Clock,
    overdue: CircleAlert,
    phone: Phone,
    email: Mail,
    search: Search,
    plus: Plus,
    edit: Pencil,
    back: ChevronLeft,
    'chevron-right': ChevronRight,
    'chevron-down': ChevronDown,
    sort: ArrowUpDown,
    'sort-asc': ArrowUp,
    'sort-desc': ArrowDown,
    more: Ellipsis,
    account: CircleUser,
    user: CircleUser,
    'sign-out': LogOut,
    install: Download,
    download: Download,
    offline: WifiOff,
    retry: RefreshCw,
    recent: History,
    history: History,
    // FR2 (P-27): timeline
    comment: MessageSquare,
    delete: Trash2,
    'arrow-right': ArrowRight,
    check: Check,
    success: CircleCheck,
    close: X,
    alert: TriangleAlert,
    info: Info,
    link: Link,
    unlink: Unlink,
    'add-person': UserPlus,
    'add-company': Building2,
    'sidebar-collapse': PanelLeftClose,
    'sidebar-expand': PanelLeftOpen,
    'not-found': SearchX,
    eye: Eye,
    'eye-off': EyeOff,
    // FR1 (P-24): users and accounts
    users: UsersRound,
    key: KeyRound,
    copy: Copy,
    admin: ShieldCheck,
    unlinked: UserX,
};

// Two sizes only: sm (16 px, inline with text) and md (20 px, navigation and buttons).
const SIZES = { sm: 'h-4 w-4', md: 'h-5 w-5' };

/** Decorative unless `title` is given. Inherits currentColor. */
export default function Icon({ name, size = 'md', className = '', title }) {
    const Component = ICONS[name];
    if (!Component) return null;
    return (
        <Component
            strokeWidth={1.75}
            className={`${SIZES[size] || SIZES.md} ${className}`.trim()}
            aria-hidden={title ? undefined : 'true'}
            role={title ? 'img' : undefined}
            focusable="false"
        >
            {title && <title>{title}</title>}
        </Component>
    );
}
