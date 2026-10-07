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
/** Wrap `send` on the PipeService prototype (idempotent). */
export declare function patchPipeServiceHelpers(): void;
