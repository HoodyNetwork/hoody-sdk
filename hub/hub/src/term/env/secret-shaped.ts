// The credential shape no store value may hold. Its own file, with no import, so code that runs outside the Hub's
// bundle (the CLI's `hoody logout`, through app/boot-keys.ts) can check it without loading the Hub's core.

/** Text shaped like a credential (an access key, a Bot key, a bearer, a signed token, a private key): never kept, under any key. */
export const SECRET_SHAPED = /(?:\bhdy_[A-Za-z0-9_-]{8,}|\bhbk_[A-Za-z0-9_-]{8,}|\bBearer\s+\S{8,}|\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.|-----BEGIN [A-Z ]*PRIVATE KEY-----|\bsk-[A-Za-z0-9_-]{16,})/;
