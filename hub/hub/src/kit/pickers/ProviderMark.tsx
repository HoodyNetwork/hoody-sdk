// A provider's mark wherever a provider is named: the kit's Hoody AI brand icon for Hoody AI, the
// provider's own mark (providerLogos.ts: each official mark unchanged, one colour, sized to one optical weight) for a
// built-in provider that has one, a Monogram for everyone else. Decorative (aria-hidden): the provider's name always
// sits next to it. Hoody AI never takes another provider's mark.
import { providers } from '@core';
import { cx } from '../controls/Button';
import { Monogram } from '../data/Display';
import { Icon } from '../icons';
import s from './ModelChooser.module.css';
import m from './ProviderMark.module.css';
import { providerLogo } from './providerLogos';

export interface ProviderMarkProps {
  /** The provider id ('hoody-ai' draws the brand icon). */
  id: string;
  /** The name shown next to the mark (its first letter is the monogram). */
  name: string;
  size?: 'sm' | 'md';
}

export function ProviderMark({ id, name, size = 'sm' }: ProviderMarkProps) {
  if (id === providers.HOODY)
    return (
      <span className={size === 'md' ? s.markMd : s.mark} aria-hidden="true">
        <Icon name="hoody-ai" size="sm" />
      </span>
    );
  const logo = providerLogo(id);
  if (!logo) return <Monogram name={name || id} size={size} />;
  return (
    <svg viewBox={logo.view} className={cx(m.logo, size === 'md' && m.logoMd)} aria-hidden="true" focusable="false">
      {logo.paths.map((p, i) => (
        <path key={i} d={p.d} fillRule={p.evenodd ? 'evenodd' : undefined} clipRule={p.evenodd ? 'evenodd' : undefined} fillOpacity={p.opacity} />
      ))}
    </svg>
  );
}
