/**
 * Tunnel wire protocol frame encoding/decoding.
 */
import { FrameType, HEADER_SIZE, MAX_PAYLOAD_SIZE, isExtensionRange, isMandatoryUnknown, } from "./tunnel-protocol-types.js";
/** Precomputed set of known frame type numeric values — hot-path allocation avoidance. */
const KNOWN_FRAME_TYPES = new Set(Object.values(FrameType).filter((v) => typeof v === "number"));
/** v3 wire-format constants. */
export const MAX_MESSAGE_SIZE = 262_144;
export const MAX_FRAMES_PER_MESSAGE = 64;
export class CodecError extends Error {
    code;
    constructor(message, code) {
        super(message);
        this.code = code;
        this.name = "CodecError";
    }
}
/**
 * Encode a frame into a Uint8Array suitable for WebSocket send.
 * Wire length is canonicalized from `payload.length`.
 */
export function encodeFrame(frame) {
    if (frame.payload.length > MAX_PAYLOAD_SIZE) {
        throw new CodecError(`payload exceeds max size: ${frame.payload.length} > ${MAX_PAYLOAD_SIZE}`, "PAYLOAD_TOO_LARGE");
    }
    const total = HEADER_SIZE + frame.payload.length;
    const buf = new Uint8Array(total);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    buf[0] = frame.header.frameType;
    view.setUint32(1, frame.header.streamId, false);
    view.setUint32(5, frame.payload.length, false);
    buf.set(frame.payload, HEADER_SIZE);
    return buf;
}
/** Encode multiple frames into one WS message buffer. */
export function encodeFrames(frames) {
    let total = 0;
    for (const f of frames)
        total += HEADER_SIZE + f.payload.length;
    const buf = new Uint8Array(total);
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let off = 0;
    for (const frame of frames) {
        buf[off] = frame.header.frameType;
        view.setUint32(off + 1, frame.header.streamId, false);
        view.setUint32(off + 5, frame.payload.length, false);
        buf.set(frame.payload, off + HEADER_SIZE);
        off += HEADER_SIZE + frame.payload.length;
    }
    return buf;
}
/**
 * Decode a binary message into a frame.
 * Returns the frame, or null if the frame type is in the extension range (silently skip).
 * Throws CodecError on protocol violation.
 */
export function decodeFrame(data) {
    if (data.length < HEADER_SIZE) {
        throw new CodecError(`frame too short: ${data.length} bytes (minimum ${HEADER_SIZE})`, "TOO_SHORT");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const typeByte = data[0];
    const streamId = view.getUint32(1, false);
    const length = view.getUint32(5, false);
    if (length > MAX_PAYLOAD_SIZE) {
        throw new CodecError(`payload exceeds max size: ${length} > ${MAX_PAYLOAD_SIZE}`, "PAYLOAD_TOO_LARGE");
    }
    const payloadEnd = HEADER_SIZE + length;
    if (data.length < payloadEnd) {
        throw new CodecError(`frame truncated: declared ${length} bytes but only ${data.length - HEADER_SIZE} available`, "TRUNCATED");
    }
    if (!KNOWN_FRAME_TYPES.has(typeByte)) {
        if (isExtensionRange(typeByte)) {
            return null;
        }
        if (isMandatoryUnknown(typeByte)) {
            throw new CodecError(`unknown mandatory frame type: 0x${typeByte.toString(16).padStart(2, "0")}`, "UNKNOWN_MANDATORY_TYPE");
        }
        throw new CodecError(`unknown frame type: 0x${typeByte.toString(16).padStart(2, "0")}`, "UNKNOWN_TYPE");
    }
    const payload = data.subarray(HEADER_SIZE, payloadEnd);
    return {
        header: {
            frameType: typeByte,
            streamId,
            length,
        },
        payload,
    };
}
/**
 * Decode a v3 multi-frame WS binary message.
 * Counts ALL raw frame headers (known + skipped extensions) against the cap.
 */
export function decodeFrames(data) {
    if (data.length === 0) {
        throw new CodecError("empty WS message", "EMPTY_MESSAGE");
    }
    if (data.length > MAX_MESSAGE_SIZE) {
        throw new CodecError(`WS message too large: ${data.length} > ${MAX_MESSAGE_SIZE}`, "MESSAGE_TOO_LARGE");
    }
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const frames = [];
    let rawFrameCount = 0;
    let hadSkippedExtension = false;
    let offset = 0;
    while (offset < data.length) {
        rawFrameCount++;
        if (rawFrameCount > MAX_FRAMES_PER_MESSAGE) {
            throw new CodecError(`too many frames: ${rawFrameCount} > ${MAX_FRAMES_PER_MESSAGE}`, "TOO_MANY_FRAMES");
        }
        if (offset + HEADER_SIZE > data.length) {
            throw new CodecError(`frame too short: ${data.length - offset} bytes (minimum ${HEADER_SIZE})`, "TOO_SHORT");
        }
        const typeByte = data[offset];
        const streamId = view.getUint32(offset + 1, false);
        const length = view.getUint32(offset + 5, false);
        if (length > MAX_PAYLOAD_SIZE) {
            throw new CodecError(`payload exceeds max size: ${length} > ${MAX_PAYLOAD_SIZE}`, "PAYLOAD_TOO_LARGE");
        }
        const payloadEnd = offset + HEADER_SIZE + length;
        if (payloadEnd > data.length) {
            throw new CodecError(`frame truncated at offset ${offset}: declared ${length} bytes`, "TRUNCATED");
        }
        if (KNOWN_FRAME_TYPES.has(typeByte)) {
            frames.push({
                header: { frameType: typeByte, streamId, length },
                payload: data.subarray(offset + HEADER_SIZE, payloadEnd),
            });
        }
        else if (isExtensionRange(typeByte)) {
            hadSkippedExtension = true;
        }
        else if (isMandatoryUnknown(typeByte)) {
            throw new CodecError(`unknown mandatory frame type: 0x${typeByte.toString(16).padStart(2, "0")}`, "UNKNOWN_MANDATORY_TYPE");
        }
        else {
            throw new CodecError(`unknown frame type: 0x${typeByte.toString(16).padStart(2, "0")}`, "UNKNOWN_TYPE");
        }
        offset = payloadEnd;
    }
    return { frames, rawFrameCount, hadSkippedExtension };
}
/** Helper: create a DATA frame */
export function dataFrame(streamId, payload) {
    return {
        header: { frameType: FrameType.Data, streamId, length: payload.length },
        payload,
    };
}
/** Helper: create a PING frame */
export function pingFrame(nonce) {
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setBigUint64(0, nonce, false);
    return {
        header: { frameType: FrameType.Ping, streamId: 0, length: 8 },
        payload,
    };
}
/** Helper: create a PONG frame */
export function pongFrame(nonce) {
    const payload = new Uint8Array(8);
    new DataView(payload.buffer).setBigUint64(0, nonce, false);
    return {
        header: { frameType: FrameType.Pong, streamId: 0, length: 8 },
        payload,
    };
}
/** Helper: create a WINDOW frame */
export function windowFrame(streamId, increment) {
    const payload = new Uint8Array(4);
    new DataView(payload.buffer).setUint32(0, increment, false);
    return {
        header: { frameType: FrameType.Window, streamId, length: 4 },
        payload,
    };
}
/** Helper: create an EOF frame */
export function eofFrame(streamId) {
    return {
        header: { frameType: FrameType.Eof, streamId, length: 0 },
        payload: new Uint8Array(0),
    };
}
