// hub/control-size-token debt: every kit control size that is a raw length or a spacing step
// today. It only shrinks: a change that fixes a row deletes it here and in FROZEN (app/conformance.controlsize.test.ts), which
// fails a row that hits nothing, an unlisted hit and any row FROZEN does not hold. A row covers one declaration. fixBy names
// the change that removes the row; keep marks a size that is no control's (a drag strip, a panel), with its reason in why.
// A reviewed file: any change to it is reviewed. Keyed by file (after hub/src/), the at-rules around the declaration
// (`at`, outermost first, absent when none), selector, property and value.
module.exports = {
  ROWS: [
    {
      file: 'kit/data/DataTable.module.css',
      selector: '.groupBtn.groupBtnStacked',
      prop: 'min-block-size',
      value: 'max(24px, var(--touch-min))',
      fixBy: 'ctl-h tokens',
      why: 'a stacked group button floors at a literal 24 px; the ctl-h tokens change reads --ctl-h-xs there',
    },
    {
      file: 'kit/data/DataTable.module.css',
      at: '@media not (pointer: coarse)',
      selector: '.groupInnerStacked .groupExtra :is(a[href], button)',
      prop: 'min-block-size',
      value: '24px',
      fixBy: 'ctl-h tokens',
      why: 'the stacked group extra action floors at a literal 24 px; the ctl-h tokens change reads --ctl-h-xs there',
    },
    {
      file: 'kit/data/Display.module.css',
      selector: '.tag .tagRemove',
      prop: 'width',
      value: 'calc(20px - 2 * var(--bw))',
      fixBy: 'ctl-h tokens',
      why: 'the Tag remove button is a 20 px box less its edge; the ctl-h tokens change makes it an IconButton xs',
    },
    {
      file: 'kit/data/Display.module.css',
      selector: '.tag .tagRemove',
      prop: 'height',
      value: 'calc(20px - 2 * var(--bw))',
      fixBy: 'ctl-h tokens',
      why: 'the Tag remove button is a 20 px box less its edge; the ctl-h tokens change makes it an IconButton xs',
    },
    {
      file: 'kit/layouts/Splitter.module.css',
      selector: '.vertical',
      prop: 'inline-size',
      value: '8px',
      fixBy: 'keep',
      why: 'a splitter drag strip: an 8 px hit strip between panes, not a control box',
    },
    {
      file: 'kit/layouts/Splitter.module.css',
      selector: '.horizontal',
      prop: 'block-size',
      value: '8px',
      fixBy: 'keep',
      why: 'a splitter drag strip: an 8 px hit strip between panes, not a control box',
    },
    {
      file: 'kit/overlays/Drawer.module.css',
      selector: '.resizer',
      prop: 'inline-size',
      value: '8px',
      fixBy: 'keep',
      why: 'the drawer resize strip: an 8 px hit strip on the edge, not a control box',
    },
    {
      file: 'kit/overlays/InfoTip.module.css',
      selector: '.icon',
      prop: 'inline-size',
      value: 'max(24px, var(--touch-min))',
      fixBy: 'ctl-h tokens',
      why: 'the info tip trigger floors at a literal 24 px; the ctl-h tokens change reads --ctl-h-xs there',
    },
    {
      file: 'kit/overlays/InfoTip.module.css',
      selector: '.icon',
      prop: 'block-size',
      value: 'max(24px, var(--touch-min))',
      fixBy: 'ctl-h tokens',
      why: 'the info tip trigger floors at a literal 24 px; the ctl-h tokens change reads --ctl-h-xs there',
    },
    {
      file: 'kit/overlays/Menu.module.css',
      selector: '.menu[data-pictures] .lead',
      prop: 'width',
      value: '22px',
      fixBy: 'keep',
      why: 'the menu lead column: an icon slot sized for a 22 px picture, not a control box',
    },
    {
      file: 'kit/states/Toast.module.css',
      selector: '.toast',
      prop: 'width',
      value: 'min(var(--toast-w, 360px), calc(100vw - 2 * var(--sp-4)))',
      fixBy: 'keep',
      why: 'the toast panel width: a surface capped by the viewport, not a control box',
    },
  ],
};
