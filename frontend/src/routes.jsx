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

    // P-03 Workers

    // P-04 Orders

    // P-05 Invoices and payments

    // P-06 Client profile

];
