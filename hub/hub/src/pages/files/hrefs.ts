// Public hrefs of the Files page, as plain strings: no component, no data, nothing that loads the kit. Ask (in the
// kit's own module graph) imports these from here, never from ./links, whose components (MountButton, StorageTab)
// import the '@kit' barrel and would close a cycle back into the loading kit (app/kitGraph.test.ts;
// every vi.mock('@kit') of a Files test would then get the real kit). Other pages keep importing ./links.
// A computer is addressed by its handle (name.last4), never by its full id.
export const links = {
  list: '/files',
  /** Files with that computer in the left pane, at `path` (default its top folder). */
  at: (handle: string, path?: string) => `/files?computer=${encodeURIComponent(handle)}${path && path !== '/' ? `&path=${encodeURIComponent(path)}` : ''}`,
  /** Files with that computer in the left pane, in the folder of the file at `path`, asking Preview of that file once.
   *  `id` (the computer's id, when the caller knows it) makes the pane resolve that computer alone. A path that names no
   *  file (the top folder, a trailing slash, or none given: the link checks call each href with a handle alone) is the
   *  folder link. */
  file: (handle: string, path = '/', id?: string): string => {
    const cut = path.lastIndexOf('/');
    const name = path.slice(cut + 1);
    const folder = path.slice(0, cut) || '/';
    const at = `/files?computer=${encodeURIComponent(handle)}${folder !== '/' ? `&path=${encodeURIComponent(folder)}` : ''}`;
    if (!name) return at;
    return `${at}&select=${encodeURIComponent(name)}&open=preview${id ? `&cid=${encodeURIComponent(id)}` : ''}`;
  },
  /** Files' "Use from your PC" tab (the command line and SDK ways) with that computer in the left pane. */
  pc: (handle: string) => `/files?computer=${encodeURIComponent(handle)}&tab=pc`,
} as const;
