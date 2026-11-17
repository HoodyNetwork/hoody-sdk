// The SHA-256 of a text, as the agent and the ledgers write it: 64 lowercase hex characters over the text's UTF-8
// bytes. Every page that checks a digest an agent sent, or keys a record by one, reads this one function.

/** SHA-256 of `text` (its UTF-8 bytes) as 64 lowercase hex characters. */
export async function sha256Hex(text: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
}
