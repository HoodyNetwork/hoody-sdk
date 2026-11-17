// The legal documents' addresses: the server writes them on the document element. Only https is followed; with none the
// words stay plain text (never a dead link).
export function legalUrl(which: 'terms' | 'privacy'): string | null {
  try {
    const u = document.documentElement.getAttribute(`data-${which}-url`) ?? '';
    return /^https:\/\/[^\s]+$/.test(u) ? u : null;
  } catch {
    return null;
  }
}
