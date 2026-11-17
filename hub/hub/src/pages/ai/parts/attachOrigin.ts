// Where a file handed to the composer came from, when it was read from a computer ("atlas:/etc/hosts", the kit's
// fileOriginText). Kept beside the File object, never in it: the composer's add path takes plain Files, and a File from
// the device's own dialog has no origin.
const origins = new WeakMap<File, string>();

/** `file`, remembered as read from `from`. */
export function fileFrom(file: File, from: string): File {
  origins.set(file, from);
  return file;
}

/** Where `file` was read from, or undefined for a file of this device. */
export const fromOf = (file: File): string | undefined => origins.get(file);
