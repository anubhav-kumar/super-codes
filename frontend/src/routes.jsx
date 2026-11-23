/**
 * Route registry. One line per route; pages load lazily (each page file needs a default export).
 * `public: true` routes render without sign-in and without the app shell.
 * `adminOnly: true` routes show "Page not found" to members (auth/RequireAdmin.jsx, matching the backend 404).
 * Add lines under the marker of your pipeline and keep the blank line after each marker.
 */
import { lazy } from 'react';

const page = (load) => lazy(load);

export const ROUTES = [
    // P-01 Sign in
    { path: '/sign-in', public: true, Page: page(() => import('./pages/SignInPage.jsx')) },
    { path: '/', Page: page(() => import('./pages/HomePage.jsx')) },

    // P-02 Client directory
    { path: '/people', Page: page(() => import('./pages/PeopleListPage.jsx')) },
    { path: '/people/new', adminOnly: true, Page: page(() => import('./pages/PersonFormPage.jsx')) },
    { path: '/people/:personId', Page: page(() => import('./pages/PersonDetailPage.jsx')) },
    { path: '/people/:personId/edit', Page: page(() => import('./pages/PersonFormPage.jsx')) },
    { path: '/companies', Page: page(() => import('./pages/CompaniesListPage.jsx')) },
    { path: '/companies/new', adminOnly: true, Page: page(() => import('./pages/CompanyFormPage.jsx')) },
    { path: '/companies/:companyId', Page: page(() => import('./pages/CompanyDetailPage.jsx')) },
    { path: '/companies/:companyId/edit', Page: page(() => import('./pages/CompanyFormPage.jsx')) },
    { path: '/companies/:companyId/people/new', adminOnly: true, Page: page(() => import('./pages/CompanyLinkPersonPage.jsx')) },

    // P-03 Workers
    { path: '/workers', Page: page(() => import('./pages/WorkersListPage.jsx')) },
    { path: '/workers/new', adminOnly: true, Page: page(() => import('./pages/WorkerFormPage.jsx')) },
    { path: '/workers/:workerId', Page: page(() => import('./pages/WorkerDetailPage.jsx')) },
    { path: '/workers/:workerId/edit', adminOnly: true, Page: page(() => import('./pages/WorkerFormPage.jsx')) },

    // P-04 Orders
    { path: '/orders', Page: page(() => import('./pages/OrdersListPage.jsx')) },
    { path: '/orders/new', adminOnly: true, Page: page(() => import('./pages/OrderFormPage.jsx')) },
    { path: '/orders/:orderId', Page: page(() => import('./pages/OrderDetailPage.jsx')) },
    { path: '/orders/:orderId/edit', Page: page(() => import('./pages/OrderFormPage.jsx')) },

    // P-05 Invoices and payments
    { path: '/invoices', Page: page(() => import('./pages/InvoicesListPage.jsx')) },
    { path: '/invoices/new', adminOnly: true, Page: page(() => import('./pages/InvoiceFormPage.jsx')) },
    { path: '/invoices/:invoiceId', Page: page(() => import('./pages/InvoiceDetailPage.jsx')) },
    { path: '/invoices/:invoiceId/edit', adminOnly: true, Page: page(() => import('./pages/InvoiceFormPage.jsx')) },
    { path: '/invoices/:invoiceId/payments/new', adminOnly: true, Page: page(() => import('./pages/PaymentFormPage.jsx')) },
    { path: '/invoices/:invoiceId/payments/:paymentId/edit', adminOnly: true, Page: page(() => import('./pages/PaymentFormPage.jsx')) },

    // P-06 Client profile

];
