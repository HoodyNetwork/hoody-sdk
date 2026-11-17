// Terminal: no web page can be drawn inside a terminal card (UrlFrame.term.tsx shows only "This site can't be shown
// here."), so the "Add a web widget" form is left out of Customize. A widget already in the stored layout still shows its
// address card, whose menu opens the page in the browser.
import type * as Web from './AddWidget';

// An empty fragment, not null: the web function is typed to return an element.
export const AddWidget: typeof Web.AddWidget = () => <></>;
