// The one-file Hub as a download (core hubFileUrl: the address, or null when this Hoody has none or this page is that
// file). The file is saved through a link with `download`, never by navigating: the Hub stays as it is, with its open
// connections, and nothing is asked before leaving. The API answers it as an attachment too, so a browser that ignores
// `download` still saves it.
import { HUB_FILE_NAME } from '@core';

/** Starts the download of the one-file Hub from `url`. `doc` is injectable for tests. */
export function saveHubFile(url: string, doc: Document = document): void {
  const a = doc.createElement('a');
  a.href = url;
  a.download = HUB_FILE_NAME;
  a.rel = 'noopener';
  a.hidden = true;
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
}
