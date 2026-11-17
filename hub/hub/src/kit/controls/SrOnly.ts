// The kit's one visually-hidden recipe: text read by assistive tech, never seen or given room. The rules live in
// kit/base.css (loaded once by the app). A part puts this class on the element it already has (a label, a caption, a
// description) instead of keeping a copy of the rules in its own stylesheet; for a new span render the kit `SrOnly`.

/** The global class of the visually-hidden recipe. */
export const SR_ONLY = 'hxSrOnly';
