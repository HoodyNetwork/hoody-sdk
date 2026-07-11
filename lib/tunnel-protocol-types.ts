/**
 * Tunnel wire protocol types and frame definitions.
 */

/** Frame header size: type (1) + stream_id (4) + length (4) = 9 bytes */
export const HEADER_SIZE = 9;

/** Maximum payload size per frame */
export const MAX_PAYLOAD_SIZE = 65_536;

/** Maximum total frame size */
export const MAX_FRAME_SIZE = HEADER_SIZE + MAX_PAYLOAD_SIZE;

export enum FrameType {
  Hello = 0x01,
  HelloOk = 0x02,
  Bind = 0x03,
  BindOk = 0x04,
  BindErr = 0x05,
  Unbind = 0x06,
  UnbindOk = 0x07,
  UnbindErr = 0x08,

  // v2 multi-WebSocket
  Join = 0x09,
  JoinOk = 0x0A,
  JoinErr = 0x0B,
  ShardMap = 0x0C,
  ReissueJoinTickets = 0x0D,

  StreamOpen = 0x10,
  StreamResponseHead = 0x16,
  Data = 0x12,
  Eof = 0x13,
  Reset = 0x14,
  Window = 0x15,

  Ping = 0x20,
  Pong = 0x21,

  Goaway = 0x30,

  BindRevoked = 0x40,
}

export enum ResetCode {
  NoError = 0x0000,
  ProtocolError = 0x0001,
  InternalError = 0x0002,
  FlowControlError = 0x0003,
  StreamClosed = 0x0004,
  FrameSizeError = 0x0005,
  RefusedStream = 0x0006,
  Cancel = 0x0007,
  EnhanceYourCalm = 0x0008,
  BindError = 0x0009,
  IdleTimeout = 0x000a,
  AuthError = 0x000b,
  VersionMismatch = 0x000c,
  BindTakeover = 0x000d,
  ResourceExhausted = 0x000e,
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
export function isExtensionRange(type: number): boolean {
  return type >= 0x40 && type <= 0x7f;
}

/** Returns true if this frame type is in the mandatory range (0x80-0xFF) */
export function isMandatoryUnknown(type: number): boolean {
  return type >= 0x80;
}

/** Returns true if this is a control frame (not DATA) */
export function isControlFrame(type: FrameType): boolean {
  return type !== FrameType.Data;
}
