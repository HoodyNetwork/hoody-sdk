// A field's own description, linked. React Aria links the description slot to the input
// (aria-describedby) through useField, whose useSlotId looks for the slot's element only when Boolean(props.description)
// changes. The kit draws a field's description itself, as a <Text slot="description">, and React Aria's field component
// types drop `description`, so the hooks saw it false for the field's whole life: a description that first appeared after
// mount was never the input's accessible description until validity changed. Every kit field that draws its own
// description passes its presence here, so the slot is looked for again whenever the description comes or goes.
export function describedProps(description: unknown): object {
  return { description: description ? true : undefined };
}
