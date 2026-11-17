// The New program form's own checks and the bodies it sends (the daemon's openapi ProgramInput,
// EphemeralProgramInput): only what the form shows is sent, everything else keeps the daemon's defaults.
import { describe, expect, it } from 'vitest';
import { EMPTY_ADD, addBody, checkAdd, onceBody, withMode, type AddForm } from './addform';

const f = (over: Partial<AddForm> = {}): AddForm => ({ ...EMPTY_ADD, name: 'my-app', command: 'node server.js', ...over });
const codes = (x: AddForm, taken: string[] = []) => checkAdd(x, taken).map((p) => `${p.field}:${p.code}`);

describe('New program form: checks', () => {
  it('a kept program needs a name, a command and an account; a run once only a command and an account', () => {
    expect(codes(f({ name: '', command: '', user: '' }))).toEqual(['name:required', 'command:required', 'user:required']);
    expect(codes(f({ mode: 'once', name: '', command: '' }))).toEqual(['command:required']);
    expect(codes(f())).toEqual([]);
  });

  it('names follow the daemon: a letter or digit first, then letters, digits, . - _, 128 at most, new on the computer', () => {
    expect(codes(f({ name: '-app' }))).toEqual(['name:nameChars']);
    expect(codes(f({ name: 'my app' }))).toEqual(['name:nameChars']);
    expect(codes(f({ name: 'a"b' }))).toEqual(['name:nameChars']);
    expect(codes(f({ name: 'a'.repeat(129) }))).toEqual(['name:nameLong']);
    expect(codes(f({ name: 'a'.repeat(128) }))).toEqual([]);
    expect(codes(f({ name: 'v1.2_x-y' }))).toEqual([]);
    expect(codes(f({ name: 'web' }), ['web'])).toEqual(['name:nameTaken']);
    // A run once is not checked against the kept programs' names.
    expect(codes(f({ mode: 'once', name: 'web' }), ['web'])).toEqual([]);
  });

  it('the command stays on one line; the account is a Linux account name of 32 bytes at most', () => {
    expect(codes(f({ command: 'a\nb' }))).toEqual(['command:commandLine']);
    expect(codes(f({ command: 'a\rb' }))).toEqual(['command:commandLine']);
    expect(codes(f({ command: 'a\u0000b' }))).toEqual(['command:commandLine']);
    expect(codes(f({ user: '1user' }))).toEqual(['user:userChars']);
    expect(codes(f({ user: 'www data' }))).toEqual(['user:userChars']);
    expect(codes(f({ user: 'a'.repeat(33) }))).toEqual(['user:userChars']);
    expect(codes(f({ user: '_svc-1$' }))).toEqual([]);
  });

  it('ports: one port 1 to 65535; a range in order and 4096 ports at most; the flag follows the daemon: - or --, then a letter', () => {
    expect(codes(f({ ports: 'one', port: '' }))).toEqual(['port:portNumber']);
    expect(codes(f({ ports: 'one', port: '0' }))).toEqual(['port:portNumber']);
    expect(codes(f({ ports: 'one', port: '65536' }))).toEqual(['port:portNumber']);
    expect(codes(f({ ports: 'one', port: '8080' }))).toEqual([]);
    expect(codes(f({ ports: 'range', rangeStart: '9000', rangeEnd: '8000' }))).toEqual(['rangeEnd:rangeOrder']);
    expect(codes(f({ ports: 'range', rangeStart: '8000', rangeEnd: '12096' }))).toEqual(['rangeEnd:rangeSize']);
    expect(codes(f({ ports: 'range', rangeStart: '8000', rangeEnd: '12095' }))).toEqual([]);
    expect(codes(f({ ports: 'range', rangeStart: 'x', rangeEnd: '' }))).toEqual(['rangeStart:portNumber', 'rangeEnd:portNumber']);
    expect(codes(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8001', portParam: '--port x' }))).toEqual(['portParam:paramChars']);
    for (const bad of ['port', '---port', '--9', '-', '--port=']) expect(codes(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8001', portParam: bad }))).toEqual(['portParam:paramChars']);
    for (const ok of ['-p', '--port', '--http_port-2']) expect(codes(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8001', portParam: ok }))).toEqual([]);
    // A run once takes no ports: whatever the hidden port fields hold is never checked.
    expect(codes(f({ mode: 'once', ports: 'one', port: '' }))).toEqual([]);
  });
});

describe('New program form: bodies', () => {
  it('keep sends name, command, account, restart policy and boot; ports only as chosen', () => {
    expect(addBody(f({ name: ' my-app ', command: ' node server.js ' }))).toEqual({ name: 'my-app', command: 'node server.js', user: 'user', autorestart: 'unexpected', boot: false });
    expect(addBody(f({ ports: 'one', port: '8080', boot: true, policy: 'true' }))).toMatchObject({ ready_port: 8080, boot: true, autorestart: 'true' });
    expect(addBody(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8003' }))).toMatchObject({ port_range: { start: 8000, end: 8003 } });
    expect(addBody(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8003' }))).not.toHaveProperty('port_param');
    expect(addBody(f({ ports: 'range', rangeStart: '8000', rangeEnd: '8003', portParam: '-p' }))).toMatchObject({ port_param: '-p' });
    // The port fields of another choice are never sent.
    expect(addBody(f({ ports: 'none', port: '8080', rangeStart: '1', rangeEnd: '2' }))).not.toHaveProperty('ready_port');
    expect(addBody(f({ ports: 'one', port: '8080', rangeStart: '1', rangeEnd: '2' }))).not.toHaveProperty('port_range');
  });

  it('run once sends command, account and restart policy, and its name only when given; never ports or boot', () => {
    expect(onceBody(f({ mode: 'once', name: '', policy: 'false', boot: true, ports: 'one', port: '80' }))).toEqual({ command: 'node server.js', user: 'user', autorestart: 'false' });
    expect(onceBody(f({ mode: 'once', name: ' job-1 ' }))).toMatchObject({ name: 'job-1' });
  });

  it("switching mode moves the restart policy to that mode's default unless the person chose one", () => {
    expect(withMode(f(), 'once', false).policy).toBe('false');
    expect(withMode(withMode(f(), 'once', false), 'keep', false).policy).toBe('unexpected');
    expect(withMode(f({ policy: 'true' }), 'once', true).policy).toBe('true');
  });
});
