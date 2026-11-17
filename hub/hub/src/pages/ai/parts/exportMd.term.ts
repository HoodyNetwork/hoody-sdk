// exportMd in the terminal. The export's text is the web's (exportMd.pure.ts). A terminal Hub writes no files (the host
// has no file save, and the web's object-URL download reads `document`, a strict global here), so "Export transcript"
// copies the chat's Markdown to the clipboard where the host takes copies, and says what happened in a toast either
// way: never silent, never a dead item.
import { makeT, showToast } from '@kit';
import { hostEnv } from '@core';
import type * as Web from './exportMd';
import strings from './exportTerm.strings.en.json';

export { EXPORT_BLOCK_MAX, exportMarkdown, exportFileName } from './exportMd.pure';
export type { ExportWords } from './exportMd.pure';

export const downloadText: typeof Web.downloadText = (name, text) => {
  const t = makeT(strings);
  let copied = false;
  try { copied = hostEnv().clipboard?.write(text) === true; } catch { copied = false; }
  if (copied) showToast({ id: 'chat-export', tone: 'ok', title: t('export.copied'), body: t('export.copiedBody', { name }) });
  else showToast({
    // noDetails: nothing failed on a server; the terminal did not take the copy (none offered, or too long).
    id: 'chat-export', tone: 'warn', title: t('export.notCopied'), body: t('export.notCopiedBody'),
  });
};
