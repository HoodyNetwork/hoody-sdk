// A tile's frame with the agent sign-in: an agent frame opens signed in with core's boot token.
//
// Contract, in plain words:
//   - Every other program mounts its Frame at once. An agent frame asks core's agentBootToken(capture()) on each
//     mount (the Tile remounts this on Reload, on the Board becoming active again and on the computer coming back to
//     running); while it waits, the Tile's loading skeleton carries the line "Signing in to agent-1…" and the header
//     dot pulses.
//   - The token lives only in this mount's state, to build that one frame src (`hdy_token`), and goes with the mount.
//     It is never stored, never in the share URL (Copy link, Open in new tab), never shown or logged.
//   - A Board kept loaded (useKeepPage) and shown again runs this effect again with the same src: a frame already
//     signed (or refused) for that src stays as it is, so the agent never reloads on return.
//   - STALE (the account changed under the request) mounts nothing: the Board reloads for the new account anyway.
//     Any other failure mounts the frame without a token, so the agent shows its own sign-in page, with a thin band
//     "Sign in to agent-1 inside this tile."
import { agentBootToken, capture } from '@core';
import { Band } from '@kit';
import { forwardRef, useEffect, useRef, useState, type Ref } from 'react';
import s from './board.module.css';
import { Frame, type FrameHandle, type FrameProps } from './Frame';
import { useT } from './text';

export interface SignedFrameProps extends FrameProps {
  /** Ask for the agent boot token first. */
  agent: boolean;
  /** The session's name ("agent-1") for the signing-in lines. */
  name: string;
}

// ready.for: the src it was signed for; a render after src changed (before the effect asks again) shows nothing.
type Sign = { kind: 'asking' } | { kind: 'stale' } | { kind: 'ready'; for: string; src: string; signed: boolean };

const withToken = (src: string, token: string): string => {
  const u = new URL(src);
  u.searchParams.set('hdy_token', token);
  return u.toString();
};

export const SignedFrame = forwardRef(function SignedFrame({ agent, name, ...frame }: SignedFrameProps, ref: Ref<FrameHandle>) {
  const t = useT();
  const [sign, setSign] = useState<Sign>({ kind: 'asking' });
  const last = useRef(sign);
  last.current = sign;
  const { src, onState } = frame;
  useEffect(() => {
    if (!agent) return;
    const was = last.current;
    if (was.kind === 'ready' && was.for === src) return;
    let live = true;
    setSign({ kind: 'asking' });
    onState('loading');
    agentBootToken(capture()).then(
      (token) => { if (live) setSign({ kind: 'ready', for: src, src: withToken(src, token), signed: true }); },
      (e: unknown) => { if (live) setSign((e as { code?: unknown } | null)?.code === 'STALE' ? { kind: 'stale' } : { kind: 'ready', for: src, src, signed: false }); },
    );
    return () => { live = false; };
  }, [agent, src]); // eslint-disable-line react-hooks/exhaustive-deps -- onState is the Tile's latest callback; a new one asks nothing again

  if (!agent) return <Frame ref={ref} {...frame} />;
  // The Tile draws the loading skeleton (the frame state stays 'loading'); this adds the signing-in line.
  if (sign.kind !== 'ready' || sign.for !== src) return sign.kind !== 'stale' ? <p className={s.signing}>{t('tile.signingIn', { name })}</p> : null;
  return (
    <>
      <Frame ref={ref} {...frame} src={sign.src} />
      {!sign.signed && <Band size="table" over>{t('tile.signInInside', { name })}</Band>}
    </>
  );
});
