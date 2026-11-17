// The fixture seam: what LIVE code may ask of the fixture world while fixtures are on, without importing a fixture
// module (the terminal ship build refuses any fixture module as an input, TERM_FIXTURE_INPUT; the web build folds
// them). The fixture side installs the answers when it loads:
//   computer  core/fixture-boot.ts (the world's computers), at its module load
//   page, errorKind, latency   app/fixtures.ts (fixtureSource, FixtureError, the latency setting), at its module load
// With fixtures compiled out (__HUB_FIXTURES__ false) nothing installs and every answer is "none", so a build keeps no
// fixture path. With fixtures on, an answer asked before its side loaded throws FIXTURES_NOT_INSTALLED (a missing
// import in a test or a boot, never a silent fallback to live).
import type { FallbackSource } from './source';
import type { WorldComputer } from './world';

export interface FixtureSeam {
  /** The world's computer with this id. */
  computer(id: string): WorldComputer | undefined;
  /** A page's fixture data source (app/fixtures.ts fixtureSource). */
  page(pageId: string): FallbackSource;
  /** A fixture failure's kind (app/fixtures.ts FixtureError), or null for any other error. */
  errorKind(e: unknown): string | null;
  /** The fixture answer latency setting ('instant', 'normal', 'slow', 'late'). */
  latency(): string;
}

let seam: Partial<FixtureSeam> = {};
const pages = new Map<string, FallbackSource>();

/** The fixture side installs its part (merged with what is there). A no-op when fixtures are compiled out. */
export function installFixtureSeam(part: Partial<FixtureSeam>): void {
  if (!__HUB_FIXTURES__) return;
  seam = { ...seam, ...part };
}

function need<K extends keyof FixtureSeam>(k: K): FixtureSeam[K] {
  const f = seam[k];
  if (!f) throw new Error(`FIXTURES_NOT_INSTALLED: the fixture seam has no '${k}' yet (load ${k === 'computer' ? 'core/fixture-boot.ts' : "'@app/fixtures'"} in this test or boot)`);
  return f as FixtureSeam[K];
}

/** The fixture world's computer with this id while fixtures are on; undefined in a build without fixtures. */
export function fixtureComputer(id: string): WorldComputer | undefined {
  return __HUB_FIXTURES__ ? need('computer')(id) : undefined;
}

/** A page's fixture source, lazy: each hook asks the installed source when it runs, so a page data module may build it
 *  at load, before the fixture side loaded. One object per page; undefined in a build without fixtures. */
export function pageFixtures(pageId: string): FallbackSource | undefined {
  if (!__HUB_FIXTURES__) return undefined;
  let s = pages.get(pageId);
  if (!s) {
    let real: FallbackSource | null = null;
    const src = (): FallbackSource => (real ??= need('page')(pageId));
    s = Object.freeze({
      useQuery: <T,>(key: string) => src().useQuery<T>(key),
      useMutation: <T, V = void>(key: string) => src().useMutation<T, V>(key),
    }) as FallbackSource;
    pages.set(pageId, s);
  }
  return s;
}

/** A fixture failure's kind (FixtureError), else null; null in a build without fixtures. */
export function fixtureErrorKind(e: unknown): string | null {
  return __HUB_FIXTURES__ ? need('errorKind')(e) : null;
}

/** The fixture latency setting while fixtures are on; null in a build without fixtures. */
export function fixtureLatency(): string | null {
  return __HUB_FIXTURES__ ? need('latency')() : null;
}

// ---- The fixture agents and the chats they hold (fixtures only; both parts are optional: absent = none) ----

/** A chat the fixture world lists that the fixture fake agent holds, so opening it shows its transcript. `script` names
 *  what its one turn did: `approval` waits on an approval, `working` is still running, `done` answered. */
export interface FixtureChatSeed {
  id: string; ask: string; script: 'approval' | 'working' | 'done';
  /** Pictures sent with the ask, as the agent's record names them: `id` (64 hex) for one it serves, none for one it cannot. */
  pictures?: readonly { name: string; id?: string; media?: string; bytes?: number }[];
}

let chatSeeds: ((computerId: string) => readonly FixtureChatSeed[]) | null = null;
/** The page fixtures install the chats their lists show (pages/ai/parts/fixtures.chats.ts). */
export function installFixtureChats(f: (computerId: string) => readonly FixtureChatSeed[]): void {
  if (!__HUB_FIXTURES__) return;
  chatSeeds = f;
}
/** The chats a fixture fake agent on this computer starts with. None while no list fixture loaded (a test of the
 *  engine alone): its agent then holds only the chats it makes, as before. */
export function fixtureChats(computerId: string): readonly FixtureChatSeed[] {
  return __HUB_FIXTURES__ && chatSeeds ? chatSeeds(computerId) : [];
}

/** What a fixture fake agent answers for: the sessions it holds, its approval mode, and the pictures a message of one was sent with
 *  (by the id its record gives each: the bytes and their type, or null for one it does not have). */
type FixtureAgent = { knows(sid: string): boolean; peek?(sid: string): { yolo: boolean }; picture?(sid: string, id: string): { bytes: Uint8Array; media: string } | null };
const agents = new Set<FixtureAgent>();
/** A fixture fake agent registers itself (ask/registry.ts) so fixture routes can answer for the sessions it holds. */
export function addFixtureAgent(o: FixtureAgent): void {
  if (__HUB_FIXTURES__) agents.add(o);
}
/** A picture a fixture fake agent keeps for a message of this session (a message sent here with pictures), else null. */
export function fixtureAgentPicture(sid: string, id: string): { bytes: Uint8Array; media: string } | null {
  for (const o of agents) { const p = o.picture?.(sid, id); if (p) return p; }
  return null;
}
/** Whether any fixture fake agent holds this session (pages/ai/fixtures.ts keep-alive routes). */
export function fixtureAgentKnows(sid: string): boolean {
  for (const o of agents) if (o.knows(sid)) return true;
  return false;
}
/** Whether auto-approve is on for this session at the fixture fake agent that holds it; null when none does. */
export function fixtureAgentYolo(sid: string): boolean | null {
  for (const o of agents) if (o.knows(sid)) return o.peek?.(sid).yolo ?? false;
  return null;
}
