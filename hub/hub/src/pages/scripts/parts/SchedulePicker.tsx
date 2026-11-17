// A run time as the Overview's Schedule card shows it. The schedule field itself is the kit's ScheduleField
// (kit/forms/ScheduleField.tsx), which draws the same UTC times in its own preview.

/** A run time in UTC, "YYYY-MM-DD HH:MM". */
export const utcText = (at: number): string => new Date(at).toISOString().slice(0, 16).replace('T', ' ');
