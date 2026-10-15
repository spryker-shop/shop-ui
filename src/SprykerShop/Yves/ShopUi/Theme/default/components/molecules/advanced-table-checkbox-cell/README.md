Displays a checkbox within table cells. Three variants:

-   plain: a checkbox only (`columns[].type: 'checkbox'`);
-   selectable: `columns[].options.selectable: true` — marks its row as selected (`advanced-table__row--selected`) and fires the bubbling `advanced-table-selection-change` event (`detail: {checked, row}`) on change;
-   head: `columns[].head.type: 'checkbox'` — a select-all checkbox for the selectable checkboxes of the same table, indeterminate while only some are checked.

Cell value (all optional): `{name, value, checked, disabled, label}`; `label` (or the column title) is the accessible name.
