// An error a PAGE holds for a field (its errorMessage or isInvalid): it is the page's to clear, and it may stay on screen until the
// next Save. React Aria's native validation turns a controlled invalid state into the input's custom validity, and the browser then
// refuses the submit for it, so fixing the field would never reach the page again. A field with a page error therefore validates
// 'aria' (it shows the error, aria-invalid and FieldError, but does not block the submit); every other field keeps the form's native
// validation, so a required or ranged field still refuses an empty or out-of-range submit as before.
export function pageErrorProps(error: unknown): { validationBehavior?: 'aria' } {
  return error ? { validationBehavior: 'aria' } : {};
}
