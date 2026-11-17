// Headings by context: a strict section's title is one level below the region or section it
// sits in, so nesting never needs a level written by hand. The page root is level 1 (its PageHeader h1).
import { createContext, useContext, type ReactNode } from 'react';
import { markElement } from './provenance';

const LevelContext = createContext(1);

/** The level of the region or section around this point: a Heading here is one below it. */
export const useHeadingLevel = (): number => useContext(LevelContext);

/** Children are one heading level deeper (a strict section's body). */
export function HeadingLevel({ children }: { children: ReactNode }) {
  const level = useContext(LevelContext);
  return <LevelContext.Provider value={level + 1}>{children}</LevelContext.Provider>;
}

/** Children sit under a heading of this level that is not a kit Heading (a Disclosure's trigger): a Heading there is one below it. */
export function HeadingBelow({ level, children }: { level: number; children: ReactNode }) {
  return <LevelContext.Provider value={level}>{children}</LevelContext.Provider>;
}

const StrictContext = createContext(false);

/** True inside a strict section: there an empty or error title is not a heading. */
export const useInStrictSection = (): boolean => useContext(StrictContext);

/** Marks the subtree as the inside of a strict section (Section, SubSection). */
export function StrictScope({ children }: { children: ReactNode }) {
  return <StrictContext.Provider value={true}>{children}</StrictContext.Provider>;
}

export interface HeadingProps {
  children: string;
  id?: string;
}

/** A heading one level below its context, clamped to h6; it stamps data-hub-h with that level. */
export function Heading({ children, id }: HeadingProps) {
  const n = Math.min(6, useHeadingLevel() + 1);
  const Tag = `h${n}` as 'h2';
  return (
    <Tag ref={markElement} id={id} data-hub-h={n} data-hub-heading="">
      {children}
    </Tag>
  );
}
