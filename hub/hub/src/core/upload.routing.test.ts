// an upload admitted on server X sends nothing once the computer's latest
// accepted row withholds the server (or names another) while the upload waits on its record step: it ends not_sent, never unknown.
import { beforeEach, describe, expect, it } from 'vitest';
import { noteComputerRows } from './computer';
import { defineRoute } from './routes';
import { installTransport, type Transport } from './transport';
import { sendFile, type FileUploadInput } from './upload';
import { boot, R1, TARGET, UID } from './test/env';

const put = defineRoute({ method: 'PUT', path: '/api/v1/files/*path', scope: 'kit', kit: 'files', index: 1, file: true, timeoutMs: 3_600_000 });
const tick = (ms = 5) => new Promise((r) => setTimeout(r, ms));
let sent = 0;
const fake: Transport = {
  hoody: () => Promise.reject(new Error('not used')),
  fetch() { sent++; return Promise.resolve(new Response('{"ok":true}', { status: 201, headers: { 'content-type': 'application/json' } })); },
};
const row = (server_name: unknown) => ({ id: TARGET.container.id, project_id: TARGET.project.id, server_name });
const input = (beforeSend: FileUploadInput['beforeSend']): FileUploadInput =>
  ({ params: { path: ['tmp', 'a.txt'] }, target: TARGET, file: new Blob(['abc']), create: true, beforeSend });

beforeEach(() => { boot({ realm: R1 }); sent = 0; installTransport(fake); noteComputerRows(UID, [row(TARGET.container.server_name)]); });

describe('an upload across a withholding row', () => {
  for (const [label, next] of [['withheld', null], ['moved to another server', 'sv2']] as const) {
    it(`${label} after admission: not_sent, nothing goes out`, async () => {
      let saved: (() => void) | null = null;
      const p = sendFile(put, input(() => new Promise<void>((r) => { saved = r; })));
      await tick();
      expect(saved, 'admitted and waiting on its record step').not.toBeNull();
      noteComputerRows(UID, [row(next)]);
      saved!();
      expect(await p).toMatchObject({ outcome: 'not_sent', code: 'NO_KIT_URL' });
      expect(sent).toBe(0);
    });
  }

  it('control: the row still naming X sends once', async () => {
    expect(await sendFile(put, input(() => {}))).toMatchObject({ outcome: 'done' });
    expect(sent).toBe(1);
  });
});
