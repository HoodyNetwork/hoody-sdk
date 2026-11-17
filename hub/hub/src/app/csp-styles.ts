// React Aria injects two <style> elements at run time: usePress's touch-action rule (id
// react-aria-pressable-style, on every page) and usePreventScroll's overscroll rule (no id, iOS
// while a modal is open). The Hub's CSP is style-src 'self' with no nonce, so the browser refuses
// them and logs a console error. This runs before React mounts and turns exactly those two into
// constructable stylesheets (CSSOM, which the CSP allows), with the same rules and lifetime:
// removing the element removes the sheet. The pressable one leaves an empty <meta> with its id, so
// React Aria's "already injected" check (getElementById) still finds it.
// Narrow on purpose: only those two known texts are adopted; every other
// node, and any text with url( or @import, passes through untouched (and the CSP still decides).
// Production only: the dev server injects its own CSS as <style> and updates it in place (HMR).
const PRESSABLE_ID = 'react-aria-pressable-style';

const norm = (css: string): string => css.replace(/\s+/g, ' ').trim();
const KNOWN = new Set([
  norm('@layer { [data-react-aria-pressable] { touch-action: pan-x pan-y pinch-zoom; } }'),
  norm('@layer { * { overscroll-behavior: contain; } }'),
]);

function isReactAriaStyle(node: Node): node is HTMLStyleElement {
  if (!(node instanceof HTMLStyleElement) || node.nonce) return false;
  if (node.id !== '' && node.id !== PRESSABLE_ID) return false;
  const css = node.textContent ?? '';
  if (/url\(|@import/i.test(css)) return false;
  return KNOWN.has(norm(css));
}

export function adoptInjectedStyles(doc: Document = document): void {
  const head = doc.head as HTMLHeadElement | null;
  if (!head || typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in doc)) return;
  const standFor = new WeakMap<Node, HTMLMetaElement>();
  const adopt = (node: Node): Node => {
    if (!isReactAriaStyle(node)) return node;
    const sheet = new CSSStyleSheet();
    try {
      sheet.replaceSync(node.textContent ?? '');
    } catch {
      return node;
    }
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
    const stand = doc.createElement('meta');
    if (node.id) stand.id = node.id;
    stand.dataset.hubAdoptedStyle = '';
    // React Aria cleans up with style.remove().
    node.remove = () => {
      doc.adoptedStyleSheets = doc.adoptedStyleSheets.filter((s) => s !== sheet);
      stand.remove();
    };
    standFor.set(node, stand);
    return stand;
  };
  // React Aria inserts both with head.prepend; nothing else is patched.
  const prepend = head.prepend.bind(head);
  head.prepend = (...nodes: (Node | string)[]) => prepend(...nodes.map((n) => (typeof n === 'string' ? n : adopt(n))));
  const removeChild = head.removeChild.bind(head);
  head.removeChild = <T extends Node>(n: T): T => {
    if (standFor.has(n)) {
      (n as unknown as HTMLStyleElement).remove();
      return n;
    }
    return removeChild(n);
  };
}
