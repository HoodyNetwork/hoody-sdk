// The gallery's Toasts tab (/_kit?tab=toasts): every tone with and without an action, a long title,
// and live buttons. The static views use ToastPreview, which renders the same ToastItem as the live
// Toaster from a local queue, so what is framed here is what the person sees.
import { Button } from '../controls/Button';
import { Panel } from '../layouts/Layouts';
import { Row, Stack } from '../layouts/Stack';
import { showToast, ToastPreview, type ToastContentData, type ToastTone } from '../states/Toast';
import { useStrings } from '../strings';
import strings from './toasts.strings.en.json';

type T = ReturnType<typeof useStrings<typeof strings>>;

export function useToastsStrings(): T {
  return useStrings(strings);
}

const TONES: readonly ToastTone[] = ['ok', 'info', 'warn', 'error', 'unknown'];
const ACTION: Record<ToastTone, keyof typeof strings> = {
  ok: 'act.undo',
  info: 'act.open',
  warn: 'act.review',
  error: 'act.retry',
  unknown: 'act.check',
};
const BODY: Partial<Record<ToastTone, keyof typeof strings>> = {
  warn: 'warn.body',
  error: 'error.body',
  unknown: 'unknown.body',
};
const noop = () => undefined;

function sample(t: T, tone: ToastTone, withAction: boolean): ToastContentData {
  const body = BODY[tone];
  return {
    tone,
    title: t(`${tone}.title`),
    ...(body ? { body: t(body) } : {}),
    ...(withAction ? { action: { label: t(ACTION[tone]), onAction: noop } } : {}),
  };
}

export function ToastsTab() {
  const t = useToastsStrings();
  const withAction = TONES.map((tone) => sample(t, tone, true));
  const plain = TONES.map((tone) => sample(t, tone, false));
  const long: ToastContentData[] = [
    {
      tone: 'error',
      title: t('long.title'),
      body: t('long.body'),
      action: { label: t('act.retry'), onAction: noop },
    },
    { tone: 'ok', title: t('long.okTitle') },
  ];
  return (
    <Stack gap={5}>
      <Panel title={t('sec.action')} description={t('sec.actionDesc')}>
        <ToastPreview toasts={withAction} label={t('preview.action')} />
      </Panel>
      <Panel title={t('sec.plain')} description={t('sec.plainDesc')}>
        <ToastPreview toasts={plain} label={t('preview.plain')} />
      </Panel>
      <Panel title={t('sec.long')} description={t('sec.longDesc')}>
        <ToastPreview toasts={long} label={t('preview.long')} />
      </Panel>
      <Panel title={t('sec.live')} description={t('sec.liveDesc')}>
        <Row wrap gap={2}>
          {TONES.map((tone) => (
            // Each live button names its tone; the toast it fires is the sample with its action.
            <Button key={tone} onPress={() => showToast(sample(t, tone, true))}>
              {t(`tone.${tone}`)}
            </Button>
          ))}
        </Row>
      </Panel>
    </Stack>
  );
}
