// The Bots page's small text pieces in the terminal: the words run on in the text around them, as the web's inline
// elements do (the terminal has no live region or direction isolate to keep).
import type * as Web from './textBits';

export const ownSentence: typeof Web.ownSentence = (text) => <>{text}</>;

export const livePreview: typeof Web.livePreview = (text) => <>{text}</>;
