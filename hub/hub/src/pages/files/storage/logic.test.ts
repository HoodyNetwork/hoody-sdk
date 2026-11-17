import { describe, expect, it } from 'vitest';
import { addressHasCredentials, staleRead, backendsOf, tokenText, connectBody, portOk, connectProved, folderLeaf, isMounted, mountProved, mountsOf, removeProved, suggestLabel, unmountProved, validLabel } from './logic';
import { BODY_KEYS, SECRET_KEYS } from './providers';

const B = (id: string, type = 'sftp', user = 'deploy') => ({ id, backend_type: type, server: `${type}:generic`, user, connected: true, created_at: 'x', mount_paths: [] });
const M = (id: string, backend: string, label: string, status = 'active') => ({ id, backend_id: backend, mount_path: '/mnt/hoody/' + label + '-0f', label, status });
const A = 'a'.repeat(16), Bb = 'b'.repeat(16), M1 = 'mount_' + '1'.repeat(32), C = 'c'.repeat(24);
const on = <T extends object>(l: T, computer = C) => ({ ...l, computer });

describe('storage logic', () => {
  it('reads the lists; a bad row makes a list incomplete; no list is not listed', () => {
    expect(backendsOf({ backends: [B(A)] })).toEqual({ listed: true, complete: true, items: [{ id: A, type: 'sftp', user: 'deploy', mountPaths: [] }] });
    expect(backendsOf({ backends: [B(A), { id: 'nope' }] }).complete).toBe(false);
    // Whether a folder is open decides a removal: unreadable folders make the row unread.
    expect(backendsOf({ backends: [{ ...B(A), mount_paths: 'x' }] }).complete).toBe(false);
    expect(backendsOf({ backends: [{ ...B(A), mount_paths: [3] }] }).complete).toBe(false);
    expect(backendsOf({}).listed).toBe(false);
    expect(mountsOf({ mounts: [M(M1, A, 'x')] }).items[0]).toMatchObject({ id: M1, backend: A, label: 'x' });
    expect(mountsOf({ mounts: [{ id: 'mount_bad' }] }).complete).toBe(false);
  });

  it('a port is 1 to 65535: the field and the body share one rule, so what the body refuses the field names', () => {
    for (const ok of ['1', '22', '65535']) expect(portOk(ok), ok).toBe(true);
    for (const bad of ['0', '65536', '70000', '99999', '123456', '22a', '-1', '']) expect(portOk(bad), bad).toBe(false);
    expect(connectBody('sftp', { host: 'h', user: 'u', pass: 'p', port: '0' })).toBeNull();
    expect(connectBody('sftp', { host: 'h', user: 'u', pass: 'p', port: '70000' })).toBeNull();
  });

  it('builds the body from filled fields only; numbers as numbers; a key on one line; required fields enforced', () => {
    expect(connectBody('sftp', { host: 'h', port: '2222', user: 'u', pass: ' p ' })).toEqual({ host: 'h', port: 2222, user: 'u', pass: ' p ' });
    expect(connectBody('sftp', { host: 'h', user: 'u' })).toBeNull();
    expect(connectBody('sftp', { host: 'h', user: 'u', key_pem: '-----BEGIN-----\nAAA\r\nBBB\n-----END-----\n' })).toMatchObject({ key_pem: '-----BEGIN-----\\nAAA\\nBBB\\n-----END-----' });
    expect(connectBody('sftp', { host: 'h', user: 'u', pass: 'p', port: '99999' })).toBeNull();
    expect(connectBody('s3', { access_key_id: 'k' })).toBeNull();
    expect(connectBody('mega', { user: 'me', pass: 'p', '2fa': '' })).toEqual({ user: 'me', pass: 'p' });
  });

  it('marks every password and key secret, and sends nothing outside the table', () => {
    expect(SECRET_KEYS).toEqual(expect.arrayContaining(['secret_access_key', 'pass', 'key_pem', 'key_file_pass', '2fa']));
    expect(SECRET_KEYS).not.toContain('user');
    expect(BODY_KEYS).not.toContain('name');
  });

  it('a connect is never proved by a list: a row cannot say which connect made it', () => {
    const i = { computer: C, type: 'sftp', user: 'deploy' };
    expect(connectProved(i, [[on(backendsOf({ backends: [B(A), B(Bb)] }))]])).toBeUndefined();
    expect(connectProved({ computer: C, type: 's3', user: '' }, [[on(backendsOf({ backends: [B(Bb, 's3', '')] }))]])).toBeUndefined();
  });

  it('refuses an address that carries a password or token; a plain address passes', () => {
    expect(addressHasCredentials('https://me:pw@dav.example.com/')).toBe(true);
    expect(addressHasCredentials('https://dav.example.com/?token=x')).toBe(true);
    expect(addressHasCredentials('me@s3.example.com')).toBe(true);
    expect(addressHasCredentials('https://dav.example.com/remote.php/dav')).toBe(false);
    expect(addressHasCredentials('s3.eu-central-1.wasabisys.com')).toBe(false);
    expect(connectBody('webdav', { url: 'https://me:pw@dav.example.com/' })).toBeNull();
    expect(connectBody('s3', { access_key_id: 'k', secret_access_key: 's', endpoint: 'https://x.example.com/?sig=1' })).toBeNull();
  });

  it('a folder is the name made plain plus a random part', () => {
    expect(folderLeaf('Backups box: Ünïcode!', 'ab'.repeat(8))).toBe('backups-box-unicode-' + 'ab'.repeat(8));
    expect(folderLeaf('日本', '00'.repeat(8))).toBe('storage-' + '00'.repeat(8));
    expect(folderLeaf('x')).toMatch(/^x-[0-9a-f]{16}$/);
    expect(folderLeaf('x')).not.toBe(folderLeaf('x'));
  });

  it('a mount is proved by its name on its backend; closing and removing by a complete list without it', () => {
    const m = { computer: C, backend: A, label: 'x', leaf: 'x-0f' };
    expect(mountProved(m, [[on(mountsOf({ mounts: [M(M1, A, 'x')] }))]])).toBe('applied');
    expect(mountProved(m, [[on(mountsOf({ mounts: [M(M1, Bb, 'x')] }))]])).toBeUndefined();
    expect(mountProved(m, [[on(mountsOf({ mounts: [M(M1, A, 'y')] }))]])).toBeUndefined();
    // Another mount under the same name, at another folder; or this one still opening: not proved.
    expect(mountProved({ ...m, leaf: 'x-1e' }, [[on(mountsOf({ mounts: [M(M1, A, 'x')] }))]])).toBeUndefined();
    expect(mountProved(m, [[on(mountsOf({ mounts: [M(M1, A, 'x', 'mounting')] }))]])).toBeUndefined();
    expect(mountProved({ computer: C, backend: A, label: 'x' }, [[on(mountsOf({ mounts: [M(M1, A, 'x')] }))]])).toBeUndefined();
    // The same folder under another name; the same mount listed by another computer: not proved.
    expect(mountProved(m, [[on(mountsOf({ mounts: [{ ...M(M1, A, 'x'), label: 'z' }] }))]])).toBeUndefined();
    expect(mountProved(m, [[on(mountsOf({ mounts: [M(M1, A, 'x')] }), 'd'.repeat(24))]])).toBeUndefined();
    expect(unmountProved({ computer: C, mount: M1 }, [[on(mountsOf({ mounts: [] }), 'd'.repeat(24))]])).toBeUndefined();
    expect(unmountProved({ computer: C, mount: M1 }, [[on(mountsOf({ mounts: [] }))]])).toBe('applied');
    expect(unmountProved({ computer: C, mount: M1 }, [[on(mountsOf({ mounts: [{ id: 'junk' }] }))]])).toBeUndefined();
    expect(unmountProved({ computer: C, mount: M1 }, [[on(mountsOf({}))]])).toBeUndefined();
    expect(removeProved({ computer: C, backend: A }, [[on(backendsOf({ backends: [B(Bb)] }))]])).toBe('applied');
    expect(removeProved({ computer: C, backend: A }, [[on(backendsOf({ backends: [B(A)] }))]])).toBeUndefined();
    expect(removeProved({ computer: C, backend: A }, [[on(backendsOf({ data: {} }))]])).toBeUndefined();
    expect(removeProved({ computer: C, backend: A }, [[on(backendsOf({ backends: [B(Bb), { id: 'junk' }] }))]])).toBeUndefined();
  });

  it('folder names are unique, short and plain; a suggestion is made unique', () => {
    const ms = mountsOf({ mounts: [M(M1, A, 'Box')] }).items;
    expect(validLabel('Box', ms)).toBe(false);
    expect(validLabel('x'.repeat(65), ms)).toBe(false);
    expect(validLabel('a\nb', ms)).toBe(false);
    expect(suggestLabel('Box', ms)).toBe('Box 2');
    expect(isMounted({ id: A, type: 'sftp', user: '', mountPaths: [] }, ms)).toBe(true);
  });

  it('phase B: a pasted rclone token is sent rebuilt from its checked fields only', () => {
    const tok = '{"access_token":"ya29.a0Af","token_type":"Bearer","refresh_token":"1//0gRf","expiry":"2026-10-24T10:00:00.1+00:00"}';
    expect(tokenText(tok)).toBe(tok);
    expect(tokenText(`  ${tok}\n`)).toBe(tok);
    // rclone authorize prints the token between two markers: everything pasted is fine.
    expect(tokenText(`Paste the following into your remote machine --->\n${tok}\n<---End paste\n`)).toBe(tok);
    // What is sent is written again from the checked fields, in rclone's order: spacing and order of the paste do not matter.
    expect(tokenText('{ "expiry" : "2026-01-01T00:00:00Z", "access_token" : "a" }')).toBe('{"access_token":"a","expiry":"2026-01-01T00:00:00Z"}');
    // A repeated field name (escaped spellings too): JSON keeps the last copy, and the hidden first copy is never sent.
    for (const dup of ['{"access_token":{"password":"CANARY"},"access_token":"a","expiry":"x"}', '{"access_token":{"password":"CANARY"},"access\\u005ftoken":"a","expiry":"x"}', '{"expiry":"CANARY","access_token":"a","expiry":"x"}']) {
      const t = tokenText(dup);
      expect(t).toBe('{"access_token":"a","expiry":"x"}');
    }
    // expires_in is a whole number of seconds that survives being written again unchanged (Go reads it as int64).
    expect(tokenText('{"access_token":"a","expiry":"x","expires_in":0}')).toBe('{"access_token":"a","expiry":"x","expires_in":0}');
    for (const n of ['9223372036854775807', '9007199254740993', '1e400', '-1', '3599.5'])
      expect(tokenText(`{"access_token":"a","expiry":"x","expires_in":${n}}`)).toBeNull();
    expect(tokenText('{"access_token":"a","refresh_token":"r"}')).toBe('{"access_token":"a","refresh_token":"r"}');
    expect(tokenText('{"access_token":"a","token_type":"bearer","expiry":"0001-01-01T00:00:00Z","expires_in":3599}')).not.toBeNull();
    // Only rclone's own token fields, each a plain value: nothing else rides along to the computer.
    for (const extra of ['{"access_token":"a","expiry":"x","other":{"password":"p"}}', '{"access_token":"a","expiry":"x","pass":"p"}', '{"access_token":"a","expiry":{"x":1}}', '{"access_token":"a","expiry":"x","expires_in":"3599"}', '{"access_token":"a","expiry":"x","__proto__":{"a":1}}', '{"access_token":"a","token_type":["b"],"expiry":"x"}'])
      expect(tokenText(extra)).toBeNull();
    // rclone prints it on one line: a line break inside is a terminal's wrap, refused (the text says to join it).
    expect(tokenText('{"access_token":"a",\n"expiry":"x"}')).toBeNull();
    for (const bad of ['', 'abc', '"tok"', '[1]', '{"access_token":""}', '{"access_token":3,"expiry":"x"}', '{"access_token":"a"}', '{"access_token":"a","refresh_token":4}', '{"access_token":"","expiry":"x"}', '{"access_token":"a","refresh_token":4,"expiry":"x"}', '{"access_token":"a","expiry":"x"', '{"a":1} {"access_token":"b","expiry":"x"}', `{"access_token":"${'x'.repeat(20000)}","expiry":"x"}`])
      expect(tokenText(bad)).toBeNull();
  });

  it('phase B: token providers send the token text, an own client id with its secret, and their optional choices', () => {
    const tok = '{"access_token":"a","token_type":"Bearer","refresh_token":"r","expiry":"x"}';
    expect(connectBody('drive', { token: `x --->\n${tok}\n<---End paste` })).toEqual({ token: tok });
    expect(connectBody('drive', { token: 'nope' })).toBeNull();
    expect(connectBody('drive', {})).toBeNull();
    expect(connectBody('dropbox', { token: tok, client_id: ' my-app ', client_secret: 's3cr' })).toEqual({ token: tok, client_id: 'my-app', client_secret: 's3cr' });
    // A secret without its client id is refused (rclone would use its own app with someone else's secret).
    expect(connectBody('box', { token: tok, client_secret: 's3cr' })).toBeNull();
    // An own client id without its secret cannot refresh the token where the provider needs the secret.
    for (const t of ['drive', 'dropbox', 'box'] as const) expect(connectBody(t, { token: tok, client_id: 'my-app' })).toBeNull();
    expect(connectBody('onedrive', { token: tok, client_id: 'my-app', drive_id: 'b!x', drive_type: 'personal' })).toEqual({ token: tok, client_id: 'my-app', drive_id: 'b!x', drive_type: 'personal' });
    // A client id is a plain name: anything a shell would act on is refused.
    // ...and never starts with a dash, which rclone would read as one of its own options.
    for (const bad of ['$(id)', 'a"b', 'a b', '`x`', "a'b", 'a;b', '--dump-bodies', '-x', '.hidden'])
      expect(connectBody('onedrive', { token: tok, client_id: bad, drive_id: 'b!x', drive_type: 'personal' })).toBeNull();
    expect(connectBody('drive', { token: tok, client_id: '123-abc.apps.googleusercontent.com', client_secret: 's' })).toMatchObject({ client_id: '123-abc.apps.googleusercontent.com' });
    expect(connectBody('drive', { token: tok, team_drive: '0ABC', root_folder_id: '' })).toEqual({ token: tok, team_drive: '0ABC' });
    // OneDrive cannot work without its drive.
    expect(connectBody('onedrive', { token: tok })).toBeNull();
    expect(connectBody('onedrive', { token: tok, drive_type: 'personal' })).toBeNull();
    expect(connectBody('onedrive', { token: tok, drive_id: 'b!x' })).toBeNull();
    // The token goes rebuilt from its checked fields, never as pasted.
    expect(connectBody('dropbox', { token: '{ "access_token" : "a",  "expiry" : "x" }' })).toEqual({ token: '{"access_token":"a","expiry":"x"}' });
    expect(connectBody('onedrive', { token: tok, drive_id: 'b!x', drive_type: 'personal' })).toEqual({ token: tok, drive_id: 'b!x', drive_type: 'personal' });
    expect(connectBody('pcloud', { token: tok, hostname: 'eapi.pcloud.com' })).toEqual({ token: tok, hostname: 'eapi.pcloud.com' });
    expect(SECRET_KEYS).toEqual(expect.arrayContaining(['token', 'client_secret']));
    // FTP: a host, the usual port, an optional account.
    expect(connectBody('ftp', { host: 'ftp.example.com', port: '21', user: 'me', pass: 'pw' })).toEqual({ host: 'ftp.example.com', port: 21, user: 'me', pass: 'pw' });
    expect(connectBody('ftp', { user: 'me', pass: 'pw' })).toBeNull();
    // A password typed into a host is refused, as in an address.
    for (const t of ['ftp', 'sftp', 'smb'] as const) {
      expect(connectBody(t, { host: 'ftp://me:pw@files.example.com', user: 'me', pass: 'x' })).toBeNull();
      expect(connectBody(t, { host: 'me:pw@files.example.com', user: 'me', pass: 'x' })).toBeNull();
    }
    expect(SECRET_KEYS).not.toContain('client_id');
    expect(BODY_KEYS).toEqual(expect.arrayContaining(['token', 'client_id', 'client_secret', 'team_drive', 'root_folder_id', 'drive_id', 'drive_type', 'hostname']));
  });
});

describe('connectBody: generated forms', () => {
  const b2 = { account: 'a', key: 'k' };
  it('a switch is sent only when set against the program\'s default, as a boolean', () => {
    expect(connectBody('b2', { ...b2, hard_delete: '' })).toEqual(b2);
    expect(connectBody('b2', { ...b2, hard_delete: 'false' })).toEqual(b2);
    expect(connectBody('b2', { ...b2, hard_delete: 'true' })).toEqual({ ...b2, hard_delete: true });
    // yandex spoof_ua defaults on: turning it off is what is sent.
    const y = { client_id: 'id', client_secret: 's', token: '{"access_token":"x","expiry":"2030-01-01T00:00:00Z"}' };
    expect(connectBody('yandex', { ...y, spoof_ua: 'false' })).toMatchObject({ spoof_ua: false });
    expect(connectBody('yandex', { ...y, spoof_ua: 'true' })).not.toHaveProperty('spoof_ua');
    expect(connectBody('b2', { ...b2, hard_delete: 'yes' })).toBeNull();
  });
  it('a whole number is a number; anything else sends nothing', () => {
    expect(connectBody('b2', { ...b2, lifecycle: '30' })).toEqual({ ...b2, lifecycle: 30 });
    for (const bad of ['-1', '1.5', '1e3', '9'.repeat(16)]) expect(connectBody('b2', { ...b2, lifecycle: bad }), bad).toBeNull();
  });
  it('a choice must be one the form offers', () => {
    expect(connectBody('azureblob', { account: 'a', delete_snapshots: 'include' })).toMatchObject({ delete_snapshots: 'include' });
    expect(connectBody('azureblob', { account: 'a', delete_snapshots: 'everything' })).toBeNull();
    expect(connectBody('s3', { provider: 'Hoody-VFS', access_key_id: 'a', secret_access_key: 's' })).toBeNull();
  });
  it('a fixed value is always sent; a required field left empty sends nothing', () => {
    expect(connectBody('oracleobjectstorage', { namespace: 'n', region: 'r', compartment: 'c' })).toEqual({ namespace: 'n', region: 'r', compartment: 'c', provider: 'no_auth' });
    expect(connectBody('b2', { account: 'a' })).toBeNull();
  });
});

describe('staleRead: when the folder list says when it was checked', () => {
  it('only after 90 s without a fresh read, never for a list never read', () => {
    expect(staleRead(1_000_000, 1_000_000 + 90_000)).toBe(false);
    expect(staleRead(1_000_000, 1_000_000 + 90_001)).toBe(true);
    expect(staleRead(0, 1_000_000)).toBe(false);
  });
});

describe('connectBody: the program\'s host fields refuse a credential inside them', () => {
  it('a URL with a password or token in Google Photos\' proxy or Cloudinary\'s upload prefix sends nothing', () => {
    expect(connectBody('cloudinary', { cloud_name: 'c', api_key: 'k', api_secret: 's', upload_prefix: 'https://u:p@api.example.com' })).toBeNull();
    expect(connectBody('cloudinary', { cloud_name: 'c', api_key: 'k', api_secret: 's', upload_prefix: 'https://api.example.com' })).toMatchObject({ upload_prefix: 'https://api.example.com' });
    const y = { token: '{"access_token":"x","expiry":"2030-01-01T00:00:00Z"}' };
    expect(connectBody('google-photos', { ...y, proxy: 'https://proxy.example.com/?access_token=abc' })).toBeNull();
  });
});
