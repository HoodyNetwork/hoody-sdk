import { usePresentation, type Presentation } from '@kit';

/** Cards or List for Computers, Servers and Projects: one remembered choice, Cards until one is made. */
export function useMachinesView(): [Presentation, (p: Presentation) => void] {
  return usePresentation('machines', 'cards');
}
