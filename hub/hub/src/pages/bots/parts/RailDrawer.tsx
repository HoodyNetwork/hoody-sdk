// A large drawer with a section rail (the kit section menu): one section at a time, the rest a click away.
// Settings and Chat apps share it so both read as one hand. Narrow, the rail is a scrolling strip above the body.
import { Drawer, SectionMenuItem, SectionMenuList, cx, useStripEdges, type DrawerProps } from "@kit";
import type { ReactNode } from "react";
import s from "./pane.module.css";

export interface RailSection<K extends string> {
  id: K;
  label: string;
  isDisabled?: boolean;
}

interface Props<K extends string> extends Omit<
  DrawerProps,
  "size" | "children"
> {
  sections: readonly RailSection<K>[];
  active: K;
  onSelect: (id: K) => void;
  /** Accessible name of the rail. */
  railLabel: string;
  /** Labels over sections that belong together, in rail order; sections in no group follow them. The ids and the drawer URL do not change. */
  groups?: ReadonlyArray<{ label: string; ids: readonly K[] }>;
  children: ReactNode;
}

export function RailDrawer<K extends string>({
  sections,
  active,
  onSelect,
  railLabel,
  groups,
  children,
  ...drawer
}: Props<K>) {
  const strip = useStripEdges<HTMLElement>(active, '[aria-current="true"]');
  const item = (x: RailSection<K>) => (
    <SectionMenuItem
      key={x.id}
      current={x.id === active}
      aria-current={x.id === active ? "true" : undefined}
      disabled={x.isDisabled}
      onClick={() => onSelect(x.id)}
    >
      {x.label}
    </SectionMenuItem>
  );
  const grouped = new Set<K>(groups?.flatMap((g) => g.ids) ?? []);
  return (
    <Drawer {...drawer} size="lg">
      <div className={s.railHost}>
        <div className={s.railDrawer}>
          <nav
            ref={strip.ref}
            className={cx(s.sectionRail, strip.fadeClassName)}
            aria-label={railLabel}
          >
            {/* The kit section menu draws the items; the nav around it only places the menu (sticky column, a scrolling strip when narrow). */}
            <SectionMenuList>
              {groups?.map((g) => [
                <span key={`group:${g.label}`} className={s.sectionRailGroup}>
                  {g.label}
                </span>,
                ...g.ids.flatMap((id) => sections.filter((x) => x.id === id).map(item)),
              ])}
              {sections.filter((x) => !grouped.has(x.id)).map(item)}
            </SectionMenuList>
          </nav>
          <div className={s.railDrawerBody}>{children}</div>
        </div>
      </div>
    </Drawer>
  );
}
