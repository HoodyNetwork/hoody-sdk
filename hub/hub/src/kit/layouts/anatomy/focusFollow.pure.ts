// The keys a group's first-use card gives its actions (see focusFollow.ts). Pure, so the terminal group reaches them
// without the DOM focus code.

/** The id a group's first-use card gives its own actions (its `action` and `learn`): never a pair key (those start with a
 *  digit), so an own action named like `1:a:b` cannot take focus meant for section `a`'s `b`. */
export const cardOwnId = (actionId: string): string => `-:${actionId}`;

/** The id a group's first-use card gives a section's primary: the same key the section's own control has. */
export const cardActionId = (sectionId: string, actionId: string): string => `${sectionId.length}:${sectionId}:${actionId}`;
