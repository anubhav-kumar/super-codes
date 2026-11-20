/**
 * Route registry. One line per route; pages load lazily (each page file needs a default export).
 * `public: true` routes render without sign-in and without the app shell.
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
    { path: '/people/new', Page: page(() => import('./pages/PersonFormPage.jsx')) },
    { path: '/people/:personId', Page: page(() => import('./pages/PersonDetailPage.jsx')) },
    { path: '/people/:personId/edit', Page: page(() => import('./pages/PersonFormPage.jsx')) },
    { path: '/companies', Page: page(() => import('./pages/CompaniesListPage.jsx')) },
    { path: '/companies/new', Page: page(() => import('./pages/CompanyFormPage.jsx')) },
    { path: '/companies/:companyId', Page: page(() => import('./pages/CompanyDetailPage.jsx')) },
    { path: '/companies/:companyId/edit', Page: page(() => import('./pages/CompanyFormPage.jsx')) },
    { path: '/companies/:companyId/people/new', Page: page(() => import('./pages/CompanyLinkPersonPage.jsx')) },

    // P-03 Workers
    { path: '/workers', Page: page(() => import('./pages/WorkersListPage.jsx')) },
    { path: '/workers/new', Page: page(() => import('./pages/WorkerFormPage.jsx')) },
    { path: '/workers/:workerId', Page: page(() => import('./pages/WorkerDetailPage.jsx')) },
    { path: '/workers/:workerId/edit', Page: page(() => import('./pages/WorkerFormPage.jsx')) },

    // P-04 Orders
    { path: '/orders', Page: page(() => import('./pages/OrdersListPage.jsx')) },
    { path: '/orders/new', Page: page(() => import('./pages/OrderFormPage.jsx')) },
    { path: '/orders/:orderId', Page: page(() => import('./pages/OrderDetailPage.jsx')) },
    { path: '/orders/:orderId/edit', Page: page(() => import('./pages/OrderFormPage.jsx')) },

    // P-05 Invoices and payments

    // P-06 Client profile

];
