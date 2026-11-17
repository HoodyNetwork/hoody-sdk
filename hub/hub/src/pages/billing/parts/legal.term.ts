// The legal documents' addresses in the terminal: the web reads them from attributes the server writes on the HTML
// document, which a terminal Hub has none of, so there is no address and the words stay plain text (never a dead link).
import type * as Web from './legal';

export const legalUrl: typeof Web.legalUrl = () => null;
