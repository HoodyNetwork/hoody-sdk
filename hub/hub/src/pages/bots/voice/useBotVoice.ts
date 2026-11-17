// useBotVoice: the one Talk session of a mounted Bot composer. Say is keyed by the Bot, so a Bot change is a new mount and
// a new session; the session is made once per mount (with its Bot captured) and disposed at unmount or when the context it
// was made in dies (a realm or account change). The log rows and the agent's capabilities flow in as they change.
import { alive, api as coreApi, capture, onBump, type Ctx } from '@core';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { botCall, ROUTES, voiceCheckOf, type LogRow, type VoiceCaps } from '../data';
import { parseBotKey } from '../logic';
import { createTalkSession, type TalkSession, type TalkSnapshot } from './session';

const loadLive = () => import('./talkLive').then((m) => m.talkLive);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' ? (v as Record<string, unknown>) : null);

function makeSession(botKey: string, ctx: Ctx, onOwnGate: () => void): TalkSession {
  const p = parseBotKey(botKey);
  const call = botCall(botKey);
  return createTalkSession({
    where: { computer: p?.computerId ?? '', realm: p?.realm ?? '', bot: p?.id ?? '' },
    botId: p?.id ?? '',
    target: call.target,
    realm: call.realm,
    load: loadLive,
    onOwnGate,
    api: {
      check: async () => voiceCheckOf(await coreApi(ROUTES.voiceCheck, { ...call, ctx } as never)),
      async cancel(turnId) {
        try {
          const raw = await coreApi(ROUTES.cancel, { ...call, ctx, body: { turn_id: turnId } } as never);
          return obj(raw)?.matched === true ? 'matched' : 'notMatched';
        } catch {
          return 'failed';
        }
      },
      async turn() {
        const b = obj(await coreApi(ROUTES.get, { ...call, ctx } as never));
        const id = typeof b?.turn_id === 'string' && b.turn_id !== '' ? b.turn_id : undefined;
        return { running: b?.turn_running === true, ...(id !== undefined ? { turnId: id } : {}) };
      },
    },
  });
}

export function useBotVoice(botKey: string, caps: VoiceCaps, rows: readonly LogRow[] | undefined, onOwnGate: () => void): { session: TalkSession; snap: TalkSnapshot } {
  const held = useRef(false);
  const gate = useRef(onOwnGate);
  useEffect(() => { gate.current = onOwnGate; });
  const [session] = useState(() => makeSession(botKey, capture(), () => gate.current()));
  const snap = useSyncExternalStore(session.subscribe, session.snapshot);
  useEffect(() => {
    const ctx = capture();
    const off = onBump(() => { if (!alive(ctx)) session.dispose(); });
    // React may run this cleanup and the effect again at once for the same mount (StrictMode): only a real unmount ends it.
    held.current = true;
    return () => {
      off();
      held.current = false;
      queueMicrotask(() => { if (!held.current) session.dispose(); });
    };
  }, [session]);
  const { stopSpeech, textKey, playLead } = caps;
  useEffect(() => session.caps({ stopSpeech: stopSpeech === true, textKey: textKey === true, playLead: playLead === true }), [session, stopSpeech, textKey, playLead]);
  useEffect(() => { if (rows) session.rows(rows); }, [session, rows, snap.voice.notes]);
  return { session, snap };
}
