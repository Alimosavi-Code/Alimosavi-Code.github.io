/**
 * Modal stack — keeps track of which document-level modal layer is on top.
 *
 * Several components (Sheet, ExportImageDialog, TableFullscreen) each register
 * a `keydown` Escape listener on `document`. When two of them are open at the
 * same time (e.g. the image-export dialog opened on top of a day sheet), a
 * single Esc press used to trigger BOTH listeners and close both layers.
 *
 * With this stack each layer only reacts to Escape when it is the TOPMOST
 * registered modal, so Esc peels one layer off at a time (top first).
 */
const stack: symbol[] = [];

/** Register a newly opened modal layer; returns its unique stack id. */
export function pushModalStack(): symbol {
  const id = Symbol("modal-layer");
  stack.push(id);
  return id;
}

/** Unregister a modal layer (on close/unmount). Safe to call twice. */
export function popModalStack(id: symbol): void {
  const i = stack.lastIndexOf(id);
  if (i !== -1) stack.splice(i, 1);
}

/** True only when `id` is the topmost open modal layer. */
export function isTopModal(id: symbol | null): boolean {
  return id != null && stack[stack.length - 1] === id;
}
