// Behaviour contract of IpAllowlistField, run on the web and in the terminal (src/term/scenario).
// The allow-list field and "Add my IP". onChange takes an updater (the page applies it to the value it holds then);
// Add my IP reads the address through `readIp` and only fills the field (nothing is sent). An IPv6, private or
// already listed address is shown and never added; a failed read says so; `locked` holds the field and the button.
import { createElement as h, useState } from 'react';
import { ANY, scenarios } from '../scenario-types';
import { IpAllowlistField } from './IpAllowlistField';

const FIELD = { role: 'textbox', name: 'Allowed addresses' } as const;
const ADD = { role: 'button', name: 'Add my IP' } as const;
const base = { label: 'Allowed addresses', description: 'IPv4 addresses or ranges, comma-separated.', locked: false };

type Up = (cur: string) => string;
/** A page that holds the list and applies each updater to it (the shape every caller has). */
function Holder({ C, p }: { C: (p: never) => unknown; p: Record<string, unknown> }) {
  const [v, setV] = useState(String(p.value ?? ''));
  const onChange = (up: Up) => { (p.onChange as (u: Up) => void)(up); setV((cur) => up(cur)); };
  return h(C as never, { ...p, value: v, onChange } as never);
}
const held = (C: unknown, p: Record<string, unknown>) => h(Holder, { C: C as never, p });
const reads = (ip: string | null, version: 4 | 6 = 4) => async () => (ip === null ? null : { ip, version });

export default scenarios('IpAllowlistField', IpAllowlistField, {
  ignored: {},
  unsupported: {},
  cases: [
    {
      name: 'typing reports an updater and the list shows what was typed',
      props: (s) => ({ ...base, value: '198.51.100.7', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads(null)) }),
      mount: held,
      steps: [{ type: [FIELD, '1'] }],
      expect: { calls: { onChange: [[ANY]], readIp: 0 }, nodes: [{ target: FIELD, value: '198.51.100.71' }] },
    },
    {
      name: 'Add my IP adds the address read and says so',
      props: (s) => ({ ...base, value: '', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads('203.0.113.9')) }),
      mount: held,
      steps: [{ press: ADD }],
      expect: { calls: { readIp: 1, onChange: [[ANY]] }, nodes: [{ target: FIELD, value: '203.0.113.9' }, { target: { text: /Added/ } }] },
    },
    {
      name: 'a private address is shown and never added',
      props: (s) => ({ ...base, value: '', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads('10.0.0.5')) }),
      mount: held,
      steps: [{ press: ADD }],
      expect: { calls: { readIp: 1, onChange: 0 }, nodes: [{ target: FIELD, value: '' }, { target: { text: /looks private/ } }] },
    },
    {
      name: 'an IPv6 address is shown and never added',
      props: (s) => ({ ...base, value: '', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads('2001:db8::1', 6)) }),
      mount: held,
      steps: [{ press: ADD }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: { text: /IPv4 only/ } }] },
    },
    {
      name: 'a failed read says so and changes nothing',
      props: (s) => ({ ...base, value: '198.51.100.7', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads(null)) }),
      mount: held,
      steps: [{ press: ADD }],
      expect: { calls: { onChange: 0 }, nodes: [{ target: FIELD, value: '198.51.100.7' }, { target: { text: /Couldn't read your address/ } }] },
    },
    {
      name: "a page's error marks the field",
      props: { ...base, value: '1.2.3', onChange: () => {}, readIp: reads(null), errorMessage: 'Use addresses such as 203.0.113.7.' },
      steps: [],
      expect: { nodes: [{ target: FIELD, states: { invalid: true }, description: 'Use addresses such as 203.0.113.7.' }] },
    },
    {
      name: 'isDisabled holds Add my IP as locked does',
      props: (s) => ({ label: base.label, description: base.description, isDisabled: true, value: '198.51.100.7', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads('203.0.113.9')) }),
      steps: [],
      expect: { nodes: [{ target: FIELD, states: { disabled: true } }, { target: ADD, states: { disabled: true } }] },
    },
    {
      name: 'locked holds the field and Add my IP',
      props: (s) => ({ ...base, locked: true, value: '198.51.100.7', onChange: s.fn('onChange'), readIp: s.fn('readIp', reads('203.0.113.9')) }),
      steps: [{ type: [FIELD, '1'], force: true }, { press: ADD, force: true }],
      expect: { calls: { onChange: 0, readIp: 0 }, nodes: [{ target: FIELD, value: '198.51.100.7', states: { disabled: true } }, { target: ADD, states: { disabled: true } }] },
    },
  ],
});
