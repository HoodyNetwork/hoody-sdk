// The kit Ledger and ShortcutTable (kit/data/Ledger) in the gallery (/_kit?tab=pieces #ledgers): a credit
// ledger with a note under a row, a muted zero, a long label and its total, and a shortcut table of two groups (one
// titled): a chord, a sequence and two alternatives. kit3.tsx mounts it; kit/data/ledger.spec.ts reads it.
// A StaticTable (kit/data/StaticTable): column headers, a row-header column, mono cells, long paths that break after
// their separators at 390 px, and one overlong hash run (the only text that may break anywhere).
// ActionCards (kit/data/ActionCards): cards that are not a press, each with an icon, a title, a line and its actions.
// The checkout ledger: a warn row "Short by" and the attached strip with its one button.
import { Button } from '../controls/Button';
import { Ledger, ShortcutTable } from '../data/Ledger';
import { StaticTable } from '../data/StaticTable';
import { ActionCards } from '../data/ActionCards';
import { Link } from '../controls/Link';
import { AnatomySection } from '../layouts/anatomy/Section';
import { useStrings } from '../strings';
import strings from './ledger.strings.en.json';

export function LedgerPieces() {
  const t = useStrings(strings);
  return (
    <AnatomySection id="ledgers" title={t('title')} state={{ kind: 'ready' }}>
      <Ledger
        label={t('credit')}
        rows={[
          { id: 'pending', label: t('pending'), amount: '$12.00', note: t('pending.note') },
          { id: 'reversed', label: t('reversed'), amount: '$0.00', tone: 'muted' },
          { id: 'owed', label: t('owed'), amount: '$1,234.56' },
        ]}
        total={{ label: t('available'), amount: '$40.00' }}
      />
      <Ledger
        label={t('checkout')}
        rows={[
          { id: 'plan', label: t('checkout.plan'), amount: '$12.00' },
          { id: 'wallet', label: t('checkout.wallet'), amount: '$5.20' },
          { id: 'short', label: t('checkout.short'), amount: '$6.80', tone: 'warn' },
        ]}
        attach={{ text: t('checkout.shortText'), action: <Button size="sm">{t('checkout.addFunds')}</Button> }}
      />
      <ShortcutTable
        label={t('keys')}
        groups={[
          {
            id: 'nav',
            title: t('keys.nav'),
            rows: [
              { keys: ['Ctrl K'], label: t('keys.search') },
              { keys: ['G', 'H'], then: true, label: t('keys.home') },
              { keys: ['J', 'K'], label: t('keys.move') },
            ],
          },
          { id: 'all', rows: [{ keys: ['?'], label: t('keys.all') }] },
        ]}
      />
      <StaticTable
        label={t('static.label')}
        mono
        columns={[
          { id: 'agent', label: t('static.agent') },
          { id: 'project', label: t('static.project') },
          { id: 'global', label: t('static.global') },
        ]}
        rows={[
          { id: 'claude', cells: ['claude-code', '.claude/skills/', '~/.claude/skills/'] },
          { id: 'codex', cells: ['codex', '.agents/skills/', '~/.codex/skills/'] },
          { id: 'long', cells: ['a-very-long-agent-name-that-wraps', '.config/a/very/long/project/path/that/wraps/on/a/phone/', '~/.local/share/agents/skills/'] },
          { id: 'hash', cells: ['pinned', '.agents/skills/sha256:0f3c9a7e5b2d4c6e8a1f0b9d7c5e3a2f/', '~/.agents/skills/'] },
        ]}
      />
      <ActionCards
        label={t('cards.label')}
        cards={[
          { id: 'terminal', icon: 'terminal', title: t('cards.terminal'), body: t('cards.terminalBody'), actions: <><Button size="sm">{t('cards.open')}</Button><Link href="https://hoody.com/kit/terminals/" variant="nav">{t('cards.docs')}</Link></> },
          { id: 'files', icon: 'files', title: t('cards.files'), body: t('cards.filesBody'), actions: <Button size="sm">{t('cards.open')}</Button> },
          { id: 'recipe', title: t('cards.recipe'), body: t('cards.recipeBody'), actions: <Button size="sm">{t('cards.try')}</Button> },
        ]}
      />
    </AnatomySection>
  );
}
