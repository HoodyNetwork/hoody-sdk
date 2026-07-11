/**
 * Tunnel wire protocol types and frame definitions.
 */
/** Frame header size: type (1) + stream_id (4) + length (4) = 9 bytes */
export declare const HEADER_SIZE = 9;
/** Maximum payload size per frame */
export declare const MAX_PAYLOAD_SIZE = 65536;
/** Maximum total frame size */
export declare const MAX_FRAME_SIZE: number;
export declare enum FrameType {
    Hello = 1,
    HelloOk = 2,
    Bind = 3,
    BindOk = 4,
    BindErr = 5,
    Unbind = 6,
    UnbindOk = 7,
    UnbindErr = 8,
    Join = 9,
    JoinOk = 10,
    JoinErr = 11,
    ShardMap = 12,
    ReissueJoinTickets = 13,
    StreamOpen = 16,
    StreamResponseHead = 22,
    Data = 18,
    Eof = 19,
    Reset = 20,
    Window = 21,
    Ping = 32,
    Pong = 33,
    Goaway = 48,
    BindRevoked = 64
}
export declare enum ResetCode {
    NoError = 0,
    ProtocolError = 1,
    InternalError = 2,
    FlowControlError = 3,
    StreamClosed = 4,
    FrameSizeError = 5,
    RefusedStream = 6,
    Cancel = 7,
    EnhanceYourCalm = 8,
    BindError = 9,
    IdleTimeout = 10,
    AuthError = 11,
    VersionMismatch = 12,
    BindTakeover = 13,
    ResourceExhausted = 14
}
export interface FrameHeader {
    frameType: FrameType;
    streamId: number;
    length: number;
}
export interface Frame {
    header: FrameHeader;
    payload: Uint8Array;
}
/** Returns true if this frame type is in the extension range (0x40-0x7F) */
export declare function isExtensionRange(type: number): boolean;
/** Returns true if this frame type is in the mandatory range (0x80-0xFF) */
export declare function isMandatoryUnknown(type: number): boolean;
/** Returns true if this is a control frame (not DATA) */
export declare function isControlFrame(type: FrameType): boolean;
