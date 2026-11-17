// The desktop's frame on the Desktop tab (Desktop.tsx): until the frame's load event a skeleton covers it (a cross-origin
// frame cannot be read, so "loaded" means only that something loaded); with no load event in 20 s it says so and offers
// the new tab. A frame holding focus keeps the keys (Hub shortcuts and Esc included), so a Leave desktop button sits
// right after it. Its own file so a terminal, which cannot draw a frame, can put a hand-off in its place.
import { Button, LinkButton, OutcomeBanner, Skeleton, useStrings } from '@kit';
import { useEffect, useRef, useState } from 'react';
import { DESKTOP_FRAME_SANDBOX, DESKTOP_SLOW_MS } from '../desktop';
import strings from '../strings.en.json';
import s from './parts.module.css';

export function DesktopFrame({ url, allow, title }: { url: string; allow: string; title: string }) {
  const t = useStrings(strings);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const leave = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (loaded) return;
    const id = setTimeout(() => setSlow(true), DESKTOP_SLOW_MS);
    return () => clearTimeout(id);
  }, [loaded]);
  return (
    <>
      {slow && !loaded ? (
        <OutcomeBanner
          // noDetails: nothing failed that the Hub can read; a cross-origin frame gives no error, only no load event
          kind="stale"
          title={t('desktop.slow')}
          body={
            <span className={s.row}>
              {t('desktop.slow.body')}
              <LinkButton size="sm" href={url} iconEnd="external">
                {t('desktop.open')}
              </LinkButton>
            </span>
          }
        />
      ) : null}
      <div className={s.desktopBox} data-desktop={loaded ? 'loaded' : 'loading'}>
        {loaded ? null : <Skeleton variant="detail" immediate className={s.desktopCover} />}
        <iframe
          className={s.desktopFrame}
          src={url}
          title={title}
          sandbox={DESKTOP_FRAME_SANDBOX}
          allow={allow}
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
        />
      </div>
      <div ref={leave} tabIndex={-1} className={s.row}>
        <Button size="sm" variant="ghost" onPress={() => leave.current?.focus()}>
          {t('desktop.leave')}
        </Button>
        <span className={s.desktopKeys}>{t('desktop.keys')}</span>
      </div>
    </>
  );
}
