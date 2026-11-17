// Test data of secrets-responder-scan.term.test.ts: one state whose responder mints a token (a secret that exists
// only once the responder is called) and records it in a store another module holds.
import { minted } from './store';

// Built at load, never a literal: no token-shaped text in a source file.
export const TOKEN = 'hdy_' + 'Zq4x'.repeat(5);

export default {
  states: {
    mint: [
      { route: { id: 'testdata.mint' }, answer: () => { minted.push(TOKEN); return { status: 201, body: { token: TOKEN, listed: minted.length } }; } },
    ],
  },
};
