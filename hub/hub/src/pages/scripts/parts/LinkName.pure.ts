// The link-name hook (split out of LinkName.tsx so the terminal build shares it; LinkName.tsx re-exports both names).
import { useState } from 'react';
import { aliasProblem, suggestAliasName } from '@core';

export function useLinkName() {
  const [suggested, setSuggested] = useState(() => suggestAliasName());
  const [name, setName] = useState(suggested);
  const problem = aliasProblem(name);
  const another = () => {
    let next = suggestAliasName();
    for (let i = 0; i < 3 && next === name; i++) next = suggestAliasName();
    setSuggested(next);
    setName(next);
  };
  return { name, setName, another, problem, valid: problem === null, typed: name.trim() !== '' && name !== suggested };
}
export type LinkName = ReturnType<typeof useLinkName>;
