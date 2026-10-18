// F4: client attributes (description, tags, notes) and the phase-3 tag catalog.
export { normalizeTag, isValidTag, tagsToArray, withClientAttributes } from './normalize-tag.js';
export { updateDescription, addTag, removeTag } from './profile.js';
export { listNotes, createNote, editNote, deleteNote, toNoteView } from './notes.js';
export {
  listCatalog,
  addCatalogTag,
  removeCatalogTag,
  setTagSettings,
  assertTagAllowed,
} from './catalog.js';
export { exportClientAttributes, eraseClientAttributes } from './privacy.js';
