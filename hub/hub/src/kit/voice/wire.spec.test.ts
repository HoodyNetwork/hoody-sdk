// @vitest-environment node
// kit/voice/wire.ts against the agent's published getBotVoice contract (x-async-api in the agent's openapi.json;
// HUB_AGENT_SPEC overrides the path). A frame or field the agent adds, drops or retypes fails here, so the codec cannot drift
// from the agent unnoticed: the same frame set both ways, each frame's required fields equal, each declared property known
// with a matching kind, the enum fields the codec checks equal to the agent's, and every connect query key published.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import { CLIENT_FRAMES, ENUMS, GATE_DECISIONS, SERVER_FRAMES, VOICE_RATES, VOICE_SUBPROTOCOL, connectQuery } from './wire';

const SPEC_FILE = monorepoPath(process.env.HUB_AGENT_SPEC, 'hoody-kit', 'hoody-agent', 'internal', 'httpapi', 'openapi.json') ?? '';
const VOICE_PATH = '/api/v1/agent/bots/{id}/voice';
/** Required enum fields read as plain text (newer values pass): reasons and error codes, never a field that picks a branch. */
const OPEN_ENUMS = ['error.code', 'output.stop.reason'];

interface Schema { type?: string | string[]; enum?: unknown[]; const?: unknown; properties?: Record<string, Schema>; required?: string[] }
interface Message { contentType: string; payload: Schema }
interface Op {
  parameters?: { name?: string; $ref?: string; schema?: Schema }[];
  'x-websocket'?: { subprotocol?: string };
  'x-async-api'?: {
    channels: Record<string, { publish: { message: { oneOf: { $ref: string }[] } }; subscribe: { message: { oneOf: { $ref: string }[] } } }>;
    components: { messages: Record<string, Message> };
  };
}

const hasSpec = existsSync(SPEC_FILE);
const op: Op | undefined = hasSpec ? (JSON.parse(readFileSync(SPEC_FILE, 'utf8')) as { paths: Record<string, { get: Op }> }).paths[VOICE_PATH]?.get : undefined;
const api = op?.['x-async-api'];
const names = (dir: 'publish' | 'subscribe'): string[] =>
  (api?.channels[VOICE_PATH]?.[dir].message.oneOf ?? []).map((r) => r.$ref.replace('#/components/messages/', ''));
const jsonOnly = (list: string[]): string[] => list.filter((n) => api?.components.messages[n]?.contentType === 'application/json').sort();

const KIND_OF: Record<string, string> = { int: 'integer', str: 'string', bool: 'boolean', obj: 'object', arr: 'array', 'arr?': 'array|null', boolstr: 'boolean|string' };
const specKind = (s: Schema | undefined): string => [s?.type ?? '?'].flat().sort().join('|');

function sameFields(table: Record<string, { req: Record<string, string>; opt: Record<string, string> }>, frame: string): void {
  const payload = api!.components.messages[frame]!.payload;
  const props = Object.fromEntries(Object.entries(payload.properties ?? {}).filter(([k]) => k !== 'type'));
  const fields = table[frame]!;
  expect(Object.keys(fields.req).sort(), `${frame} required`).toEqual((payload.required ?? []).filter((k) => k !== 'type').sort());
  expect([...Object.keys(fields.req), ...Object.keys(fields.opt)].sort(), `${frame} properties`).toEqual(Object.keys(props).sort());
  for (const [k, kind] of Object.entries({ ...fields.req, ...fields.opt })) expect(KIND_OF[kind], `${frame}.${k}`).toBe(specKind(props[k]));
  expect(payload.properties?.type?.const, `${frame} type const`).toBe(frame);
}

describe.skipIf(!hasSpec)('the voice codec against the published getBotVoice contract', () => {
  it('speaks the published subprotocol', () => {
    expect(op?.['x-websocket']?.subprotocol).toBe(VOICE_SUBPROTOCOL);
  });

  it('builds exactly the client JSON frames the agent reads, each with its declared fields', () => {
    expect(Object.keys(CLIENT_FRAMES).sort()).toEqual(jsonOnly(names('publish')));
    for (const f of Object.keys(CLIENT_FRAMES)) sameFields(CLIENT_FRAMES, f);
    // input.audio is the one binary client frame (encodeInputAudio).
    expect(names('publish').filter((n) => !jsonOnly(names('publish')).includes(n))).toEqual(['input.audio']);
  });

  it('reads exactly the server JSON frames the agent sends, each with its declared fields', () => {
    expect(Object.keys(SERVER_FRAMES).sort()).toEqual(jsonOnly(names('subscribe')));
    for (const f of Object.keys(SERVER_FRAMES)) sameFields(SERVER_FRAMES, f);
    expect(names('subscribe').filter((n) => !jsonOnly(names('subscribe')).includes(n))).toEqual(['output.audio']);
  });

  it('checks exactly the enums the agent declares (the codec\'s own tables, both ways)', () => {
    const en = (frame: string, field: string) => [...(api!.components.messages[frame]!.payload.properties?.[field]?.enum ?? [])].map(String).sort();
    const checked = Object.entries(ENUMS).flatMap(([frame, fields]) => Object.entries(fields ?? {}).map(([field, values]) => ({ frame, field, values })));
    expect(checked.length).toBeGreaterThanOrEqual(3);
    for (const c of checked) expect([...c.values].sort(), `${c.frame}.${c.field}`).toEqual(en(c.frame, c.field));
    expect([...GATE_DECISIONS].sort()).toEqual(en('own_gate.decide', 'decision'));
    // Every enum of a server frame's required field is either checked by the codec or deliberately open: a reason the
    // agent adds later must not make a stop invalid (its audio would keep playing). A new one is a deliberate change.
    const open: string[] = [];
    for (const f of Object.keys(SERVER_FRAMES)) {
      const payload = api!.components.messages[f]!.payload;
      for (const k of payload.required ?? []) {
        if (k !== 'type' && payload.properties?.[k]?.enum && !ENUMS[f as keyof typeof ENUMS]?.[k]) open.push(`${f}.${k}`);
      }
    }
    expect(open.sort()).toEqual(OPEN_ENUMS);
  });

  it('asks only published connect parameters, with values their schemas take', () => {
    const params = new Map((op?.parameters ?? []).filter((p) => p.name).map((p) => [p.name!, p.schema]));
    const q = connectQuery({ mode: 'vad', inRate: 16000, outRate: 24000, takeover: true, speak: false, playLead: true, require: 'stt,tts' });
    for (const [k, v] of Object.entries(q)) {
      const s = params.get(k);
      expect(s, `query ${k}`).toBeDefined();
      if (s?.enum) expect(s.enum.map(String), `query ${k}`).toContain(v);
      if (s?.type === 'boolean') expect(['true', 'false'], `query ${k}`).toContain(v);
    }
    expect((params.get('in_rate')?.enum ?? []).map(Number).sort((a, b) => a - b)).toEqual([...VOICE_RATES]);
  });
});
