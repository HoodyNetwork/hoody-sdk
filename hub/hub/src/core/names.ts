// names.ts: a suggested name for something new, a computer or a Bot (the same rules as public/auth/hub-names.js). No DOM, no network.
//
// Contract, in plain words:
//   - suggestName(rand?) → "adjective-color-animal", lower case, letters and hyphens only, so it passes every
//     name rule the Hub creates things under (a computer's 3-100 [A-Za-z0-9_-], a Bot's name). At most NAME_MAX
//     characters, for a narrow field.
//   - rand(n) → an integer in [0, n). The default draws from crypto.getRandomValues with rejection sampling (no
//     modulo bias). Without a secure source suggestName() returns '' (the field then has no suggestion):
//     Math.random is never used.
//   - The words are plain, friendly English (no brands, no people, nothing a person could take as an insult),
//     English on purpose: a name is an identifier and works in every locale.

const ADJECTIVES = ['agile', 'amber', 'bold', 'brave', 'bright', 'brisk', 'calm', 'clever', 'cosmic', 'crisp', 'daring', 'deft', 'eager', 'fancy', 'fast',
  'fresh', 'gentle', 'glad', 'golden', 'happy', 'jolly', 'keen', 'kind', 'lively', 'lucky', 'merry', 'mighty', 'nimble', 'noble', 'plucky', 'proud',
  'quick', 'quiet', 'rapid', 'sleek', 'smart', 'snappy', 'steady', 'sunny', 'swift', 'tidy', 'vivid', 'warm', 'witty', 'zesty', 'cheery', 'dandy', 'epic'] as const;
const COLORS = ['amber', 'azure', 'beige', 'black', 'blue', 'bronze', 'coral', 'cream', 'crimson', 'cyan', 'emerald', 'gold', 'green', 'grey', 'indigo',
  'ivory', 'jade', 'khaki', 'lemon', 'lilac', 'lime', 'maroon', 'mint', 'navy', 'olive', 'orange', 'peach', 'pink', 'plum', 'purple', 'red', 'rose',
  'ruby', 'rust', 'sage', 'sand', 'scarlet', 'silver', 'tan', 'teal', 'violet', 'white', 'yellow'] as const;
const ANIMALS = ['otter', 'falcon', 'badger', 'beaver', 'bison', 'camel', 'cheetah', 'cobra', 'condor', 'coyote', 'crane', 'dolphin', 'eagle', 'ferret',
  'finch', 'fox', 'gecko', 'gazelle', 'heron', 'hare', 'ibis', 'jaguar', 'koala', 'lemur', 'lynx', 'llama', 'marten', 'moose', 'narwhal', 'newt',
  'ocelot', 'orca', 'owl', 'panda', 'parrot', 'pelican', 'puffin', 'quail', 'raven', 'robin', 'seal', 'shrew', 'sparrow', 'squid', 'stork', 'swan',
  'tapir', 'tiger', 'toucan', 'turtle', 'walrus', 'weasel', 'whale', 'wombat', 'yak', 'zebra', 'alpaca', 'lark', 'magpie', 'marmot', 'osprey', 'wren'] as const;

export const NAME_MAX = 40;
const RULE = /^[a-z]+(?:-[a-z]+)*$/;

export type Rand = (n: number) => number;

function secure(n: number): number {
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function' || !(n >= 1) || n > 0x10000) return -1;
  // Rejection sampling over 32 bits: values at or above the largest multiple of n would favour small results.
  const limit = 0x100000000 - (0x100000000 % n), buf = new Uint32Array(1);
  for (let i = 0; i < 16; i++) {
    c.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < limit) return v % n;
  }
  return -1;
}

function pick(list: readonly string[], rand: Rand): string | null {
  const i = rand(list.length);
  return typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < list.length ? (list[i] ?? null) : null;
}

/** adjective-color-animal, or '' without a secure random source. */
export function suggestName(rand?: Rand): string {
  const r = typeof rand === 'function' ? rand : secure;
  for (let tries = 0; tries < 8; tries++) {
    const a = pick(ADJECTIVES, r), c = pick(COLORS, r), n = pick(ANIMALS, r);
    if (a === null || c === null || n === null) return '';
    if (a === c) continue; // "amber-amber-fox" reads like a stutter
    const name = a + '-' + c + '-' + n;
    if (name.length <= NAME_MAX) return name;
  }
  return '';
}

/** A name in the suggester's own shape (3..NAME_MAX, lower-case words joined by hyphens). */
export function suggestedNameValid(s: unknown): boolean {
  return typeof s === 'string' && s.length >= 3 && s.length <= NAME_MAX && RULE.test(s);
}

export const nameWords = Object.freeze({ adjectives: ADJECTIVES, colors: COLORS, animals: ANIMALS });
