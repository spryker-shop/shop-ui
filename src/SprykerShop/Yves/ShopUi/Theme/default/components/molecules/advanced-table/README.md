Implements a flexible table component that supports:

-   Dynamic column rendering
-   Custom cell types via `type` parameter
-   Cell content translation
-   Modifiable styling through modifiers
-   Component-based cell rendering with dedicated molecules
-   Header cells other than a plain title via `columns[].head.type` (renders `advanced-table-<head.type>-cell` with `isHead: true`; optional `headCell` value)
-   Header hints via `columns[].hint: {text, label, attributes}` (glossary keys; `label` defaults to the column title;
    optional `attributes` for the icon, e.g. `data-qa`): an info icon
    with a tooltip next to the title. On a sortable column a click on the icon sorts too, like any click on the header.
-   Row hooks via `rows[]._row.class` and `rows[]._row.attributes` (e.g. JS hooks, `data-*`, `data-qa`)
