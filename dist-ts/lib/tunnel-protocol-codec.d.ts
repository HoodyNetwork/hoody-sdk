/**
 * Tunnel wire protocol frame encoding/decoding.
 */
import { type Frame } from "./tunnel-protocol-types.js";
/** v3 wire-format constants. */
export declare const MAX_MESSAGE_SIZE = 262144;
export declare const MAX_FRAMES_PER_MESSAGE = 64;
export declare class CodecError extends Error {
    readonly code: "TOO_SHORT" | "PAYLOAD_TOO_LARGE" | "TRUNCATED" | "UNKNOWN_MANDATORY_TYPE" | "UNKNOWN_TYPE" | "EMPTY_MESSAGE" | "MESSAGE_TOO_LARGE" | "TOO_MANY_FRAMES";
    constructor(message: string, code: "TOO_SHORT" | "PAYLOAD_TOO_LARGE" | "TRUNCATED" | "UNKNOWN_MANDATORY_TYPE" | "UNKNOWN_TYPE" | "EMPTY_MESSAGE" | "MESSAGE_TOO_LARGE" | "TOO_MANY_FRAMES");
}
/** Multi-frame decode result for v3 WS messages. */
export interface DecodeResult {
    frames: Frame[];
    /** Total raw frame headers parsed (known + skipped extensions). */
    rawFrameCount: number;
    /** True if any unknown extension frame was silently skipped. */
    hadSkippedExtension: boolean;
}
/**
 * Encode a frame into a Uint8Array suitable for WebSocket send.
 * Wire length is canonicalized from `payload.length`.
 */
export declare function encodeFrame(frame: Frame): Uint8Array;
/** Encode multiple frames into one WS message buffer. */
export declare function encodeFrames(frames: Frame[]): Uint8Array;
/**
 * Decode a binary message into a frame.
 * Returns the frame, or null if the frame type is in the extension range (silently skip).
 * Throws CodecError on protocol violation.
 */
export declare function decodeFrame(data: Uint8Array): Frame | null;
/**
 * Decode a v3 multi-frame WS binary message.
 * Counts ALL raw frame headers (known + skipped extensions) against the cap.
 */
export declare function decodeFrames(data: Uint8Array): DecodeResult;
/** Helper: create a DATA frame */
export declare function dataFrame(streamId: number, payload: Uint8Array): Frame;
/** Helper: create a PING frame */
export declare function pingFrame(nonce: bigint): Frame;
/** Helper: create a PONG frame */
export declare function pongFrame(nonce: bigint): Frame;
/** Helper: create a WINDOW frame */
export declare function windowFrame(streamId: number, increment: number): Frame;
/** Helper: create an EOF frame */
export declare function eofFrame(streamId: number): Frame;
