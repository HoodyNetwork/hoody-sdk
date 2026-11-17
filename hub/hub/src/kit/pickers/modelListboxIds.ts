// Option ids of the model chooser's listbox, shared by the web ModelListbox and its terminal sibling.

/** FNV-1a of a spec: option ids stay valid HTML ids whatever the spec holds. */
export function specHash(spec: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < spec.length; i++) {
    h ^= spec.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
export const optionId = (listId: string, spec: string): string => `${listId}-o-${specHash(spec)}`;
