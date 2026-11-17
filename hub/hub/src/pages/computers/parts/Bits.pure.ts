// The Computers page's docs link and state tones (split out of Bits.tsx so the terminal build shares them; Bits.tsx
// re-exports both).
import type { Tone } from '@kit';

export const DOCS_PERMISSIONS = 'https://docs.hoody.com/foundation/proxy/permissions/';

export const STATE_TONE: Record<string, Tone> = { running: 'ok', stopped: 'neutral', paused: 'neutral', starting: 'info', failed: 'danger', attention: 'warn', gone: 'neutral', reinstalled: 'neutral' };
