// A create that sent an SSH key and is answered "created" with no key: the API made the computer but did not install
// the key (it lost a uniqueness race; the API notes it on the create, the answer's
// ssh_public_key is null). The create's select keeps only that fact, so the drawer can say it.
// | 1 | the create's select answers 'none' for an answer with ssh_public_key null, 'set' for one naming a key | 'select keeps the key state' |
// | 2 | nothing else of the answer leaves select (no key text, no environment)                               | 'select keeps nothing else' |
// | 3 | keyNotInstalled only when a key was sent and the answer names none                                   | 'keyNotInstalled' |
import { describe, expect, it } from 'vitest';
import { createdKey, keyNotInstalled } from './create-logic';
import { computersTable } from './data';

const KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl user@host';
const select = (raw: unknown) => computersTable.changes!.create!.select!(raw, undefined as never);
const answer = (computer: Record<string, unknown>) => ({ statusCode: 201, message: 'Computer creation initiated successfully', data: computer });

describe('create: the SSH key the API did not install', () => {
  it('select keeps the key state', () => {
    expect(select(answer({ id: 'a'.repeat(24), name: 'box', ssh_public_key: null }))).toBe('none');
    expect(select(answer({ id: 'a'.repeat(24), name: 'box', ssh_public_key: KEY }))).toBe('set');
    expect(select({ data: { computer: { id: 'a'.repeat(24), ssh_public_key: null } } })).toBe('none');
    expect(select(answer({ id: 'a'.repeat(24), name: 'box' }))).toBeUndefined();
    expect(select(null)).toBeUndefined();
  });

  it('select keeps nothing else', () => {
    const out = select(answer({ id: 'a'.repeat(24), name: 'box', ssh_public_key: KEY, environment_vars: { TOKEN: 'secret-value' } }));
    expect(out).toBe('set');
    expect(JSON.stringify(out)).not.toContain('AAAA');
    expect(JSON.stringify(out)).not.toContain('secret-value');
  });

  it('keyNotInstalled', () => {
    expect(keyNotInstalled({ name: 'box', ssh_public_key: KEY }, createdKey(answer({ ssh_public_key: null })))).toBe(true);
    expect(keyNotInstalled({ name: 'box', ssh_public_key: KEY }, createdKey(answer({ ssh_public_key: KEY })))).toBe(false);
    // No key was sent: an answer with none is the plain case.
    expect(keyNotInstalled({ name: 'box' }, createdKey(answer({ ssh_public_key: null })))).toBe(false);
    // The answer does not say (a held create proved later has no answer): nothing is claimed.
    expect(keyNotInstalled({ name: 'box', ssh_public_key: KEY }, undefined)).toBe(false);
  });
});
