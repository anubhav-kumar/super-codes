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

    // P-03 Workers
    { path: '/workers', Page: page(() => import('./pages/WorkersListPage.jsx')) },
    { path: '/workers/new', Page: page(() => import('./pages/WorkerFormPage.jsx')) },
    { path: '/workers/:workerId', Page: page(() => import('./pages/WorkerDetailPage.jsx')) },
    { path: '/workers/:workerId/edit', Page: page(() => import('./pages/WorkerFormPage.jsx')) },

    // P-04 Orders

    // P-05 Invoices and payments

    // P-06 Client profile

];
