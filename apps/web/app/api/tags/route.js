import {
  CatalogTagBodySchema,
  TagSettingsBodySchema,
  addCatalogTag,
  listCatalog,
  setTagSettings,
} from '@vartalap/core';
import { parseBody, requireAdmin, requireUser, withHandler } from '../../../lib/api.js';

export const runtime = 'nodejs';

// F4 phase 3: admin tag catalog.
// GET → { tags: [{ name, createdAt }], catalogOnly }. Any signed-in user: the catalog is
// admin-defined vocabulary (no client data), and agents need it for autocomplete.
export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  const { tags, catalogOnly } = await listCatalog();
  const isAdmin = user.role === 'admin';
  return Response.json({
    catalogOnly,
    tags: tags.map(({ name, createdAt, createdBy }) =>
      isAdmin ? { name, createdAt, createdBy } : { name },
    ),
  });
});

// POST { name } → 201 { tag }. Admin only. 409 CONFLICT if it exists.
export const POST = withHandler(async (request) => {
  const user = await requireAdmin(request);
  const { name } = await parseBody(request, CatalogTagBodySchema);
  const tag = await addCatalogTag({ name, by: user });
  return Response.json({ tag }, { status: 201 });
});

// PATCH { catalogOnly } → 200 { catalogOnly }. Admin only. When on, chats accept only
// catalog tags (existing tags on chats are kept).
export const PATCH = withHandler(async (request) => {
  const user = await requireAdmin(request);
  const { catalogOnly } = await parseBody(request, TagSettingsBodySchema);
  return Response.json(await setTagSettings({ catalogOnly, by: user }));
});
