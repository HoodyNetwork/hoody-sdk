// Download from a link: the files program's own downloader, given an id the Hub makes
// (`download_client_id`), so a link download is never started twice (C9). Declared once, here.
//   - linkRoute: POST ?download_from=<link>&filename&id&timeout into a folder (the multi-part path core writes). It
//     answers 202 once the download is recorded and accepted; the download then runs on the computer, page closed or
//     not. Secret: the link is the person's and may hold a credential, so a rejection keeps only its status and one of
//     the codes below, never the program's text (it can quote the link).
//   - downloadRoute: GET /api/v1/downloads/{id}, one download, running or ended within 7 days (404: no record).
//   - cancelRoute: DELETE /api/v1/downloads/{id} (202; 404 when it is not running).
//   - downloadsRoute: GET /api/v1/downloads, the downloads running on the computer now.
//   - versionRoute: GET /api/v1/version, whose `features` say whether the program takes the id.
// The records' `url` and `error_message` are never read (data.ts recordOf keeps neither).
import { defineRoute } from '@core';

const kit = { scope: 'kit', kit: 'files', index: 1 } as const;

/** The codes a refused link download may keep (everything else of a rejection is dropped). */
const LINK_CODES = ['DOWNLOAD_ID_EXISTS', 'FILE_PATH_BUSY', 'JOB_COUNT_LIMIT', 'INVALID_PARAMETER', 'NOT_FOUND', 'FORBIDDEN'] as const;

export const linkRoute = defineRoute({
  method: 'POST', path: '/api/v1/files/*path', ...kit,
  query: ['download_from', 'filename', 'id', 'timeout'],
  secret: true, codes: LINK_CODES,
});
/** One download by its id (it also answers for an ended one, within 7 days). */
export const downloadRoute = defineRoute({ method: 'GET', path: '/api/v1/downloads/:id', ...kit, maxBytes: 64 * 1024 });
/** Cancel a running download. */
export const cancelRoute = defineRoute({ method: 'DELETE', path: '/api/v1/downloads/:id', ...kit });
/** The downloads running on the computer now (the Transfers panel). */
export const downloadsRoute = defineRoute({ method: 'GET', path: '/api/v1/downloads', ...kit, maxBytes: 1024 * 1024 });
/** The program's version and features. */
export const versionRoute = defineRoute({ method: 'GET', path: '/api/v1/version', ...kit, maxBytes: 64 * 1024 });
