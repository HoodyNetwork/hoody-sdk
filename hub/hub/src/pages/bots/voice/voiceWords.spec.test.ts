// @vitest-environment node
// voiceCodes.gen.json against the agent's published getBotVoice contract (x-async-api in
// the agent's openapi.json; HUB_AGENT_SPEC overrides the path, as kit/voice/wire.spec.test.ts). Any code the
// agent adds, drops or renames fails here; HUB_VOICE_CODES_REGEN=1 rewrites the file from the spec instead.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monorepoPath } from '@core/test/monorepo';
import gen from './voiceCodes.gen.json';

const SPEC_FILE = monorepoPath(process.env.HUB_AGENT_SPEC, 'hoody-kit', 'hoody-agent', 'internal', 'httpapi', 'openapi.json') ?? '';
const VOICE_PATH = '/api/v1/agent/bots/{id}/voice';
type Prop = { enum?: string[]; description?: string };
const hasSpec = existsSync(SPEC_FILE);
const messages: Record<string, { payload: { properties: Record<string, Prop> } }> = hasSpec
  ? JSON.parse(readFileSync(SPEC_FILE, 'utf8')).paths[VOICE_PATH].get['x-async-api'].components.messages
  : {};
const prop = (frame: string, field: string): Prop => {
  const p = messages[frame]?.payload.properties[field];
  if (!p) throw new Error(`${frame}.${field} is not in the contract`);
  return p;
};
const enumOf = (frame: string, field: string): string[] => {
  const e = prop(frame, field).enum;
  if (!e?.length) throw new Error(`${frame}.${field} has no enum`);
  return e;
};
/** The codes a description names as `code (what it means)`, in order. */
const named = (frame: string, field: string): string[] => [...(prop(frame, field).description ?? '').matchAll(/\b([a-z][a-z0-9_]*) \(/g)].map((m) => m[1]!);
/** refused.code: "…, as in the HTTP error answer: a, b, … or z." */
const listed = (frame: string, field: string): string[] => {
  const d = prop(frame, field).description ?? '';
  const body = /answer: ([a-z0-9_, ]+?)\.$/.exec(d)?.[1] ?? '';
  return body.split(/, | or /).filter(Boolean);
};
/** transcript.final failed: "Sent but failed: submit, or the speech service's reason." */
const lead = (frame: string, field: string): string[] => {
  const m = /^Sent but failed: ([a-z_]+),/.exec(prop(frame, field).description ?? '');
  return m ? [m[1]!] : [];
};

function fromSpec(): Record<string, string[]> {
  return {
    refused: listed('refused', 'code'),
    rejected: named('transcript.final', 'rejected'),
    noSpeech: named('transcript.final', 'no_speech'),
    failed: lead('transcript.final', 'failed'),
    error: enumOf('error', 'code'),
    speech: [...new Set([...enumOf('reply.final', 'reason'), ...enumOf('output.stop', 'reason')])],
    failure: enumOf('reply.final', 'failure'),
    textResult: enumOf('text.result', 'code'),
    textDropped: enumOf('text.result', 'reason'),
  };
}

describe.skipIf(!hasSpec)('voiceCodes.gen.json against the published getBotVoice contract', () => {
  it('every family reads at least one code (the description shapes still parse)', () => {
    for (const [f, codes] of Object.entries(fromSpec())) expect(codes.length, f).toBeGreaterThan(0);
  });
  it('holds exactly the codes the contract names, family by family, in its order', () => {
    const spec = fromSpec();
    if (process.env.HUB_VOICE_CODES_REGEN === '1') {
      const out = '{\n' + Object.entries(spec).map(([f, c]) => `  ${JSON.stringify(f)}: ${JSON.stringify(c).replace(/","/g, '", "')}`).join(',\n') + '\n}\n';
      writeFileSync(join(__dirname, 'voiceCodes.gen.json'), out);
      return;
    }
    expect(gen, 'the agent changed a voice code list: run with HUB_VOICE_CODES_REGEN=1, then give each new code its words').toEqual(spec);
  });
});
