/**
 * Pipe service helpers: `box.pipe.send` reports a failed transfer.
 *
 * The kit answers a sender with HTTP 200 as soon as it takes the upload and
 * streams the outcome as `[INFO]` / `[ERROR]` lines in the response body. The
 * generated `send` resolved on that 200, so a transfer nobody received
 * (`[ERROR] Timed out waiting for receivers.`) looked like a success unless
 * the caller scanned `data` itself. Here `send` reads the lines the way
 * `PipeStream.send` and the CLI do (lib/pipe-status.ts `transferFailure`):
 * it resolves as before when the kit confirms the transfer (`Transfer
 * complete.`, or `Live stream ended` for `live`) and otherwise rejects with a
 * `PipeTransferError` carrying the kit's text, the HTTP status and the lines.
 *
 * The signature and the resolved value are the generated ones. A refused
 * request (non-2xx) still rejects with the ApiError of the generated call.
 *
 * Browser-safe: no Node imports. Same prototype-patch pattern as
 * lib/kv-helpers.ts.
 */
import { PipeService } from '../generated/pipe/pipe.service.js';
import { StatusLines } from './pipe-status.js';
const PIPE_HELPERS_PATCH_MARKER = Symbol.for('hoody.sdk.pipe.service.helpers');
/**
 * The status log of a sender's answer, in whichever shape the call's
 * `rawResponse` / `responseType` gave it: the envelope's `data`, the bare
 * text, or its bytes. undefined for a shape that holds no log.
 */
async function statusLog(result) {
    let body = result;
    let status = 200;
    if (body !== null && typeof body === 'object' && 'data' in body && 'statusCode' in body) {
        const envelope = body;
        if (typeof envelope.statusCode === 'number')
            status = envelope.statusCode;
        body = envelope.data;
    }
    if (typeof body === 'string')
        return { text: body, status };
    if (typeof Blob !== 'undefined' && body instanceof Blob)
        return { text: await body.text(), status };
    if (body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
        return { text: new TextDecoder('utf-8').decode(body), status };
    }
    return undefined;
}
function checkedSend(send) {
    return async function (...args) {
        const result = await send.apply(this, args);
        const log = await statusLog(result);
        if (log === undefined)
            return result;
        const lines = new StatusLines();
        lines.feed(log.text, true);
        const failed = lines.failure(log.status, 'pipe.send');
        if (failed)
            throw failed;
        return result;
    };
}
/** Wrap `send` on the PipeService prototype (idempotent). */
export function patchPipeServiceHelpers() {
    const proto = PipeService.prototype;
    if (proto[PIPE_HELPERS_PATCH_MARKER])
        return;
    proto.send = checkedSend(proto.send);
    proto[PIPE_HELPERS_PATCH_MARKER] = true;
}
patchPipeServiceHelpers();
