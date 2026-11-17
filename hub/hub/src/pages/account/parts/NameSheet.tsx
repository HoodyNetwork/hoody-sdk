// Change the display name, in a drawer. The name is judged before it is sent (empty, too long, unchanged); a change
// whose outcome is unknown locks the drawer (Check again reads the profile back, nothing is resent, C9).
import { Button, Drawer, DrawerCancel, OutcomeBanner, TextField, useStrings } from '@kit';
import { useState } from 'react';
import { pressContext, useArmedHolds, useProfile, useRename } from '../data';
import { errorWords, nameProblem, nameRefusal, refusal } from '../logic';
import strings from '../strings.en.json';
import { DismissNote } from './DismissNote';
import { LockedFooter } from './Footers';
import { locks, releaseOp, stillOut, useOpLock } from './locks';
import s from './Rules.module.css';

const FORM = 'account-name-form';
const FIELD_ERROR = { empty: 'p.eEmpty', long: 'p.eLong', same: 'p.eSame' } as const;

export interface NameSheetProps {
  open: boolean;
  onClose: () => void;
  /** The new name was saved (the profile is read again). */
  onDone: () => void;
}

export function NameSheet({ open, onClose, onDone }: NameSheetProps) {
  const t = useStrings(strings);
  const profile = useProfile();
  const rename = useRename();
  const lock = useOpLock('name');
  // Core's own hold of the change survives a reload (the page's lock does not): either one locks the drawer.
  const held = lock === 'pending' || rename.pending;
  const current = profile.data?.alias ?? '';
  // Filled once with the name shown when the drawer opened; a profile that answers later fills it then.
  const [value, setValue] = useState<string | null>(null);
  const shown = value ?? current;
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<{ text: string; error: { outcome: string; code?: string; status?: number } } | null>(null);
  const [checking, setChecking] = useState(false);
  const [unsure, setUnsure] = useState(false);
  // The last Start over found its holds already replaced or freed: nothing was dismissed.
  const [nothing, setNothing] = useState(false);
  // The holds the warning was shown over: a press frees those, not what core holds by then.
  const armed = useArmedHolds(unsure, rename.heldNow);

  const close = () => {
    setValue(null);
    setError(undefined);
    setBanner(null);
    setUnsure(false);
    setNothing(false);
    onClose();
  };

  const submit = async () => {
    // A 'sent' lock is a send still out (this drawer remounted): nothing goes twice.
    if (rename.running || lock || held) return;
    setBanner(null);
    const problem = nameProblem(shown, current);
    if (problem) {
      setError(t(FIELD_ERROR[problem]));
      return;
    }
    setError(undefined);
    const ep = locks.sent('name');
    const r = await rename.run({ alias: shown.trim() });
    locks.settle('name', stillOut(r), ep);
    if (r.outcome === 'done') {
      onDone();
      close();
    } else if (!stillOut(r) && (r.outcome === 'failed' || r.outcome === 'not_sent')) {
      // No password is asked here: a bare 401 is a session that ended, never a wrong password.
      // Too many renames says the wait when the answer named one.
      const w = errorWords(refusal(r), 'password');
      const text = w.key === 'err.password' ? t('err.generic') : 'vars' in w ? t(w.key, w.vars) : t(w.key);
      // A refusal of the name itself is said at the field, where the name is typed again.
      if (nameRefusal({ outcome: r.outcome, ...refusal(r) })) setError(t('p.nameRefused'));
      else setBanner({ text, error: { outcome: r.outcome, ...refusal(r) } });
    }
  };

  // The profile showing the asked name proves the change (core's read-back); anything else stays unknown.
  const check = async () => {
    const v = locks.version('name');
    // After a reload only core holds the change (no page lock to release): a proven read-back completes it, unless a
    // page lock appeared meanwhile (a newer send of this page).
    const own = locks.snapshot().get('name') !== undefined;
    setChecking(true);
    const proven = await rename.readBack();
    const r = await profile.refetch();
    setChecking(false);
    if (proven && !r.isError && (own ? releaseOp('name', v) : locks.snapshot().get('name') === undefined)) {
      onDone();
      close();
    } else {
      // An inconclusive Check again is the person's refresh: the warning is shown over the holds held now.
      armed.retake();
      setNothing(false);
      setUnsure(true);
    }
  };

  return (
    <Drawer overlayId="account-name-sheet" resizeKey="account-name"
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      title={t('p.renameTitle')}
      subtitle={t('p.renameLead')}
      size="sm"
      dirty={!held && value !== null && value !== current}
      busy={rename.running}
      footer={
        held ? (
          <LockedFooter onClose={close} onCheck={() => void check()} checking={checking} />
        ) : (
          <>
            <DrawerCancel />
            <Button variant="primary" type="submit" form={FORM} busy={rename.running}>
              {t('p.save')}
            </Button>
          </>
        )
      }
    >
      {held && (
        <div className={s.banner}>
          <OutcomeBanner
            kind="pending"
            // noDetails: a send whose answer never came has no rejection to show; the banner offers the read-back.
            known={unsure ? t('check.unknown') : t('err.pending')}
            checkLine={unsure ? t('check.checkLine') : undefined}
            stopLine={unsure ? t('check.stopLine') : undefined}
            actions={
              unsure ? (
                <Button
                  size="sm"
                  onPress={() => {
                    // The warned Stop tracking: frees the shown hold in the context it was pressed in, and only the lock
                    // version it was pressed over.
                    const at = pressContext(), v = locks.version('name');
                    void rename.dismissRows(armed.shown()).then((freed) => {
                      if (!at.still()) return;
                      if (!freed) {
                        setNothing(true);
                        return;
                      }
                      if (releaseOp('name', v)) setUnsure(false);
                    });
                  }}
                >
                  {t('check.startOver')}
                </Button>
              ) : undefined
            }
          />
        </div>
      )}
      <DismissNote show={nothing} />
      {banner && <div className={s.banner}><OutcomeBanner kind="failed" title={t('sheet.failedTitle')} body={banner.text} error={banner.error} /></div>}
      <form
        id={FORM}
        className={s.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <TextField
          label={t('p.alias')}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          isDisabled={held}
          value={shown}
          onChange={(v) => {
            setValue(v);
            setError(undefined);
          }}
          errorMessage={error}
        />
      </form>
    </Drawer>
  );
}
