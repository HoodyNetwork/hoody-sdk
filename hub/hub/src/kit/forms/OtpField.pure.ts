// The code field's digit rule, shared by OtpField.tsx (web) and OtpField.term.tsx (terminal). No DOM.

/** Digits from whatever was typed or pasted ("123 456", "123-456"), capped at `length`. */
export function otpDigits(raw: string, length = 6): string {
  return raw.replace(/\D/g, '').slice(0, length);
}
