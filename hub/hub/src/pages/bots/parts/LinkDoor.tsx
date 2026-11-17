// "How to use it" for one address of a Bot link: the address to copy, Open and a QR code for the
// pages a person opens (the chat page, the skill file), and the connect examples for the addresses a program calls. The
// examples never hold a real key: they read it from HOODY_BOT_KEY (logic.ts snippets). Who can call the address is one
// closed Why that ends with the links question.
import { CodeBlock, CopyField, Drawer, LinkButton, QrButton, SubSection, Why, useStrings } from '@kit';
import { DOOR_EXAMPLES, SNIPPET_LANG, snippets, type AddressKind } from '../logic';
import { pageFaq } from '../faq';
import strings from '../strings.en.json';

export interface Door {
  id: AddressKind;
  value: string;
  open?: string;
}

/** `door` is the last one asked for, kept while the drawer closes; `open` says whether it is shown. `base`: the link's address, which the examples build on; `label`: the link's label, their model name. */
export function DoorDrawer({ open, door, base, botName, label, onClose }: { open: boolean; door: Door | null; base: string; botName: string; label: string; onClose: () => void }) {
  const t = useStrings(strings);
  const { byId } = pageFaq(t);
  const kind = door ? t(`addr.kind.${door.id}`) : '';
  const examples = door ? DOOR_EXAMPLES[door.id] : [];
  const code = door && examples.length > 0 ? snippets(base, label) : null;
  const subtitle = door === null ? '' : examples.length > 0 ? t('connect.desc') : t(door.id === 'chat' ? 'door.desc.chat' : 'door.desc.skill');
  return (
    <Drawer
      overlayId="bots-link-door-drawer"
      resizeKey="bots-link-door"
      isOpen={open && door !== null}
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      title={t('door.title', { kind })}
      subtitle={subtitle}
      actions={
        door?.open ? (
          <>
            {door.id === 'chat' && <QrButton url={door.value} name={botName} secret={false} logo="bot" />}
            <LinkButton href={door.open} size="sm" iconEnd="external" aria-label={t(door.id === 'chat' ? 'link.any.open.chat' : 'link.any.open.skill')}>
              {t('link.open')}
            </LinkButton>
          </>
        ) : undefined
      }
    >
      {/* plain: an address a program calls is copied, not opened (only the chat page and the skill file open). */}
      {door && <CopyField label={t('link.address')} value={door.value} plain={door.open === undefined} />}
      {/* Each example under its own visible title: a CodeBlock's label only names it to assistive tech. */}
      {code &&
        examples.map((k) => (
          <SubSection key={k} title={t(`connect.kind.${k}`)}>
            <CodeBlock label={t(`connect.kind.${k}`)} code={code[k]} lang={SNIPPET_LANG[k]} wrap />
          </SubSection>
        ))}
      {/* Who can use the address, closed, then the links question: a page that
          opens (the chat page, the skill file) opens for anyone, and using the Bot needs a key; an address a program calls
          answers only with a key. Either way only while the link is on. */}
      <Why question={t('door.why')} faq={{ item: byId.linkKeys, label: t('link.any.more') }}>
        {t(door?.open === undefined ? 'door.whyText.call' : 'door.whyText.open')}
      </Why>
    </Drawer>
  );
}
