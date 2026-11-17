// The Exec folder the page shows: a quiet "Folder N" chip in the header when it is not folder 1, and the switch itself in a closed
// "Advanced" section at the foot of the list. Switching sends nothing: it changes `?exec=` and the page reads that folder.
// Only numbered folders (1 to 9999) can be opened; what a folder holds is read from the computer, never assumed.
import { Button, Disclosure, SettingRow, Stack, Tag, TextField, useStrings } from '@kit';
import { EXEC_DEFAULT, execOfParam } from '@core';
import { useEffect, useState } from 'react';
import strings from '../strings.en.json';
import s from './parts.module.css';

/** "Folder 3" beside the title while the page shows a folder other than 1; nothing for folder 1. */
export function FolderChip({ exec }: { exec: number }) {
  const t = useStrings(strings);
  if (exec === EXEC_DEFAULT) return null;
  return (
    <span title={t('folder.chipTip', { n: exec })}>
      <Tag>{t('folder.chip', { n: exec })}</Tag>
    </span>
  );
}

export interface FolderAdvancedProps {
  exec: number;
  /** A `?exec=` value the page could not open, or null: the section opens by itself (the reason is the list's notice line). */
  bad: string | null;
  /** The folder's `.exclusive` marker: true = it is there, false/null = not there or not known (nothing said). */
  exclusive: boolean | null;
  onOpen: (exec: number) => void;
}

export function FolderAdvanced({ exec, bad, exclusive, onOpen }: FolderAdvancedProps) {
  const t = useStrings(strings);
  const [draft, setDraft] = useState(String(exec));
  const [tried, setTried] = useState(false);
  // Opens by itself whenever the address asks for a folder it cannot show (on arrival or later): the person needs to see why.
  const [expanded, setExpanded] = useState(bad !== null);
  useEffect(() => { if (bad !== null) setExpanded(true); }, [bad]);
  // The field follows the folder shown (Back, a link, the button below).
  useEffect(() => { setDraft(String(exec)); setTried(false); }, [exec]);
  const asked = execOfParam(draft.trim());
  const open = () => {
    setTried(true);
    if (asked !== null && asked !== exec) onOpen(asked);
  };
  return (
    <Disclosure title={t('folder.advanced')} isExpanded={expanded} onExpandedChange={setExpanded} className={s.folder}>
      <SettingRow label={t('folder.label')} help={t('folder.help')}>
        {/* One child for the row's value: the note sits under the field and its buttons, never beside them. */}
        <Stack gap={0}>
          <div className={s.folderRow}>
            <TextField
              aria-label={t('folder.label')}
              mono
              value={draft}
              onChange={(v) => { setDraft(v); setTried(false); }}
              inputMode="numeric"
              maxLength={4}
              className={s.folderField}
              errorMessage={tried && asked === null ? t('folder.invalid') : undefined}
              onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
            />
            <Button variant="secondary" onPress={open} isDisabled={asked === exec}>
              {t('folder.go')}
            </Button>
            {exec !== EXEC_DEFAULT ? (
              <Button variant="ghost" onPress={() => onOpen(EXEC_DEFAULT)}>
                {t('folder.back')}
              </Button>
            ) : null}
          </div>
          {exclusive === true ? <p className={s.folderNote}>{t('folder.exclusive')}</p> : null}
        </Stack>
      </SettingRow>
    </Disclosure>
  );
}
