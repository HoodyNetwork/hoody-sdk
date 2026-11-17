// Export vault: every entry of ONE partition in one JSON file.
//
// The file is the agent TUI's import shape, so its Import reads it back: { "<key>": { "value": "...", "metadata": {...} } },
// keys sorted, two-space indent, no wrapper.
//   - Encrypted (the default): every plain value becomes an SDK envelope under the person's password (crypto.ts
//     encryptMany: one key derivation for the export). A value that is already a valid envelope (crypto.ts
//     isValidEnvelope, decrypt's own checks) is copied byte for byte and never decrypted; a value that only looks like
//     one is locked like any other. A newly encrypted entry's metadata gets encrypted: true, as a Hub write does (logic.ts
//     metadataWrite). Names and metadata stay readable.
//   - Readable: the values as stored. The dialog asks for a danger confirm first.
//
// Values: read one by one through core's api() with the page's own scrub (copied out, nulled in the answer, so core
// keeps none), kept only in this run's local list, and dropped once the text is built. Nothing here logs, toasts or puts
// a value, password or envelope in an error; a result names keys and counts only.
export { exportText, lockValues, exportFileName, runExport } from './exportVault.pure';
export type { ExportMode, ExportEntry, ExportProgress, ExportRun, ExportOptions } from './exportVault.pure';

/** Hands the text to the browser as a download; the object URL is revoked at once after the click. */
export function saveExport(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
