// Root-cause clusters for layout-census.ts --report. First match wins; a fault no rule matches is clustered by the
// innermost shared component on its chain. Fields of match (all optional, all must hold): kind (exact), page (regex),
// chain (regex over the chain joined innermost-first with ' < '), detail (regex), acted (boolean). Delete a rule when its
// count is zero. (A .ts file, not JSON: every JSON under scripts/term is a global input of the page gate.)
import type { CensusRule } from './layout-census';

export const CENSUS_RULES: CensusRule[] = [
  {
    "id": "scroll-after-action",
    "title": "A shot's replayed action (click, keys) leaves a scroll box off its top",
    "area": "terminal build",
    "status": "new (unclassified)",
    "match": {
      "kind": "scrolled-open",
      "acted": true
    }
  },
  {
    "id": "bots-deep-link-scrolled",
    "title": "Bots opened on a Bot (?sel=): the list scrolls to the selected row and the chat log opens at its end",
    "area": "terminal build",
    "status": "new (unclassified)",
    "match": {
      "kind": "scrolled-open",
      "page": "^bots$"
    }
  },
  {
    "id": "scroll-open-other",
    "title": "A page opens scrolled with no action",
    "area": "terminal build",
    "status": "new",
    "match": {
      "kind": "scrolled-open"
    }
  },
  {
    "id": "plancard-head",
    "title": "PlanCard head: title and badge share one row, the title is crushed (wrapped by letter or lost), a long value is cut",
    "area": "pages",
    "status": "new",
    "match": {
      "chain": "PlanCard"
    }
  },
  {
    "id": "logs-toolbar-60",
    "title": "Logs toolbar source group wider than the pane at 60 columns",
    "area": "terminal css",
    "status": "in progress",
    "match": {
      "page": "^logs$",
      "chain": "div\\.srcGroup"
    }
  },
  {
    "id": "table-taller-than-box",
    "title": "DataTable laid out 1-2 rows taller than its box (list beside a detail at 200+ columns; paged tables at 60/80)",
    "area": "kit data",
    "status": "new",
    "match": {
      "kind": "cut",
      "detail": "^(\\d+)x\\d+ at (\\d+,\\d+) past its box \\1x\\d+ at \\2",
      "chain": "^(DataTableTerm|component<|hub-shell-pane|div\\.stack)"
    }
  },
  {
    "id": "facts-value-width",
    "title": "Facts/FactRow value: a list or long value wider than its cell, or the value column collapsed to 1 cell",
    "area": "kit layouts",
    "status": "new",
    "match": {
      "chain": "(FactRow|Facts<|ul\\.lines|div\\.answer)"
    }
  },
  {
    "id": "referrals-code-row",
    "title": "Referrals code row: link and copy 57 wide in 53 at 60 columns",
    "area": "pages",
    "status": "new",
    "match": {
      "page": "^referrals$",
      "chain": "CodeRow"
    }
  },
  {
    "id": "agent-signin",
    "title": "AgentSignIn body laid out below its box (cut at the bottom) in the new-script page",
    "area": "AI and Ask",
    "status": "new",
    "match": {
      "chain": "AgentSignIn"
    }
  },
  {
    "id": "agent-hint-header",
    "title": "AgentHint open in a PageHeader: a wide line widens the header past the pane, the right side is cut",
    "area": "AI and Ask",
    "status": "new",
    "match": {
      "chain": "PageHeader",
      "page": "^(bots|notes|vault|scripts|computers)$"
    }
  },
  {
    "id": "bots-flow-steps",
    "title": "Bots chat-apps drawer ol.flowSteps wider than its box at every size (a fixed width from CSS)",
    "area": "AI and Ask",
    "status": "new",
    "match": {
      "chain": "ol\\.flowSteps"
    }
  },
  {
    "id": "bots-section-rail-60",
    "title": "Bots settings drawer nav.sectionRail 76 wide in 57 at 60 columns (does not wrap)",
    "area": "AI and Ask",
    "status": "new",
    "match": {
      "chain": "nav\\.sectionRail"
    }
  },
  {
    "id": "files-two-panes-wide",
    "title": "Files two panes at 200+ columns: a 1x1 box on the pane's cells (overdraw)",
    "area": "pages",
    "status": "new",
    "match": {
      "page": "^files$",
      "kind": "overdraw"
    }
  },
  {
    "id": "files-bar-picker-80",
    "title": "Files folder bar at 80 columns: ComputerPicker label and arrow past a 14-20 wide box",
    "area": "kit pickers",
    "status": "new",
    "match": {
      "page": "^files$",
      "kind": "cut"
    }
  },
  {
    "id": "detail-pane-short",
    "title": "ListDetailPage detail pane at 60x20: thread/detail content taller than the pane, parts overdraw",
    "area": "terminal build",
    "status": "in progress (ListDetailPage small sizes)",
    "match": {
      "page": "^(support|billing|market)$",
      "chain": "(ListDetailPage|Thread|div\\.withOverview)"
    }
  },
  {
    "id": "computers-network-flow",
    "title": "Computers network flow boxes (ol.flow li.box): tags and addresses past a 9-14 wide box at 80/120",
    "area": "pages",
    "status": "new",
    "match": {
      "chain": "ol\\.flow"
    }
  },
  {
    "id": "softpress-in-row",
    "title": "SoftPress link at the end of a row laid out past the row (no wrap, no shrink)",
    "area": "kit forms",
    "status": "new",
    "match": {
      "chain": "^SoftPress"
    }
  },
  {
    "id": "scripts-row-actions-80",
    "title": "Scripts builds list: row actions 23 wide start at 57 in a 75 wide row at 80 columns",
    "area": "pages",
    "status": "in progress (terminal build, Scripts)",
    "match": {
      "page": "^scripts$",
      "chain": "span\\.actions"
    }
  },
  {
    "id": "dialog-paragraph",
    "title": "Dialog paragraph laid beside the dialog's content box instead of in it (programs system confirm, every size)",
    "area": "kit overlays",
    "status": "new",
    "match": {
      "chain": "^p < .*Dialog"
    }
  },
  {
    "id": "menu-separator",
    "title": "Menu PickList separator text wraps to 8 lines in a 1-row box",
    "area": "kit overlays",
    "status": "new",
    "match": {
      "chain": "PickList"
    }
  },
  {
    "id": "help-line-60",
    "title": "Compat span.help / p note line wider than its box (no wrap)",
    "area": "kit layouts",
    "status": "new",
    "match": {
      "chain": "^(span\\.help|p\\.folderNote|span\\.hideIcon)"
    }
  }
];
