// "How Hoody fits together": the four ideas a newcomer needs, in the order they nest (realms hold computers,
// programs and an agent run on a computer, Bots reach it from anywhere). An ordered list; the arrows between the
// steps are decoration. Shown in the Welcome panel and under the setup panel.
import { CHAT_SLOTS, ChatNames, Icon, useStrings, type IconName } from '@kit';
import strings from '../strings.en.json';
import s from './home.module.css';

const IDEAS = [
  { id: 'realms', icon: 'realm' },
  { id: 'computers', icon: 'computer' },
  { id: 'on', icon: 'apps' },
  { id: 'bots', icon: 'bot' },
] as const satisfies readonly { id: string; icon: IconName }[];

export function FitsTogether({ titleKey, headingId }: { titleKey: 'intro.title' | 'intro.setupTitle'; headingId: string }) {
  const t = useStrings(strings);
  return (
    <div className={s.fits}>
      <h2 id={headingId} className={s.fitsTitle}>
        {t(titleKey)}
      </h2>
      <ol className={s.ideas} aria-labelledby={headingId}>
        {IDEAS.map((idea, i) => (
          <li key={idea.id} className={s.idea} data-idea={idea.id}>
            <span className={s.ideaMark} aria-hidden="true">
              <Icon name={idea.icon} size="md" />
              <span className={s.ideaNum}>{i + 1}</span>
            </span>
            <span className={s.ideaText}>
              <strong className={s.ideaName}>{t(`intro.${idea.id}`)}</strong>
              <span className={s.ideaBody}>
                <ChatNames text={t(`intro.${idea.id}.body`, CHAT_SLOTS)} />
              </span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
