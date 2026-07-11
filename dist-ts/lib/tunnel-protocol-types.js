/**
 * Tunnel wire protocol types and frame definitions.
 */
/** Frame header size: type (1) + stream_id (4) + length (4) = 9 bytes */
export const HEADER_SIZE = 9;
/** Maximum payload size per frame */
export const MAX_PAYLOAD_SIZE = 65_536;
/** Maximum total frame size */
export const MAX_FRAME_SIZE = HEADER_SIZE + MAX_PAYLOAD_SIZE;
export var FrameType;
(function (FrameType) {
    FrameType[FrameType["Hello"] = 1] = "Hello";
    FrameType[FrameType["HelloOk"] = 2] = "HelloOk";
    FrameType[FrameType["Bind"] = 3] = "Bind";
    FrameType[FrameType["BindOk"] = 4] = "BindOk";
    FrameType[FrameType["BindErr"] = 5] = "BindErr";
    FrameType[FrameType["Unbind"] = 6] = "Unbind";
    FrameType[FrameType["UnbindOk"] = 7] = "UnbindOk";
    FrameType[FrameType["UnbindErr"] = 8] = "UnbindErr";
    // v2 multi-WebSocket
    FrameType[FrameType["Join"] = 9] = "Join";
    FrameType[FrameType["JoinOk"] = 10] = "JoinOk";
    FrameType[FrameType["JoinErr"] = 11] = "JoinErr";
    FrameType[FrameType["ShardMap"] = 12] = "ShardMap";
    FrameType[FrameType["ReissueJoinTickets"] = 13] = "ReissueJoinTickets";
    FrameType[FrameType["StreamOpen"] = 16] = "StreamOpen";
    FrameType[FrameType["StreamResponseHead"] = 22] = "StreamResponseHead";
    FrameType[FrameType["Data"] = 18] = "Data";
    FrameType[FrameType["Eof"] = 19] = "Eof";
    FrameType[FrameType["Reset"] = 20] = "Reset";
    FrameType[FrameType["Window"] = 21] = "Window";
    FrameType[FrameType["Ping"] = 32] = "Ping";
    FrameType[FrameType["Pong"] = 33] = "Pong";
    FrameType[FrameType["Goaway"] = 48] = "Goaway";
    FrameType[FrameType["BindRevoked"] = 64] = "BindRevoked";
})(FrameType || (FrameType = {}));
export var ResetCode;
(function (ResetCode) {
    ResetCode[ResetCode["NoError"] = 0] = "NoError";
    ResetCode[ResetCode["ProtocolError"] = 1] = "ProtocolError";
    ResetCode[ResetCode["InternalError"] = 2] = "InternalError";
    ResetCode[ResetCode["FlowControlError"] = 3] = "FlowControlError";
    ResetCode[ResetCode["StreamClosed"] = 4] = "StreamClosed";
    ResetCode[ResetCode["FrameSizeError"] = 5] = "FrameSizeError";
    ResetCode[ResetCode["RefusedStream"] = 6] = "RefusedStream";
    ResetCode[ResetCode["Cancel"] = 7] = "Cancel";
    ResetCode[ResetCode["EnhanceYourCalm"] = 8] = "EnhanceYourCalm";
    ResetCode[ResetCode["BindError"] = 9] = "BindError";
    ResetCode[ResetCode["IdleTimeout"] = 10] = "IdleTimeout";
    ResetCode[ResetCode["AuthError"] = 11] = "AuthError";
    ResetCode[ResetCode["VersionMismatch"] = 12] = "VersionMismatch";
    ResetCode[ResetCode["BindTakeover"] = 13] = "BindTakeover";
    ResetCode[ResetCode["ResourceExhausted"] = 14] = "ResourceExhausted";
})(ResetCode || (ResetCode = {}));
/** Returns true if this frame type is in the extension range (0x40-0x7F) */
export function isExtensionRange(type) {
    return type >= 0x40 && type <= 0x7f;
}
/** Returns true if this frame type is in the mandatory range (0x80-0xFF) */
export function isMandatoryUnknown(type) {
    return type >= 0x80;
}
/** Returns true if this is a control frame (not DATA) */
export function isControlFrame(type) {
    return type !== FrameType.Data;
}
