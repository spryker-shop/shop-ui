Provides functionality to add additional information (a hint) about something a user hovers their mouse over.

By default only the tooltip itself is rendered: the parent element is the trigger and controls its visibility
(for example with the `top` modifier and a `:hover` rule in the parent's styles).

With `hasTrigger: true` the component renders its own trigger as well: an info icon that shows the tooltip while it is
hovered or focused, positioned with the `anchored` modifier (added automatically).

Data: `text` (already translated), `hasTrigger` (default `false`) and, used only with `hasTrigger`, `triggerLabel`,
`triggerIcon` (default `action-default`) and `triggerAttributes` (e.g. `data-qa`). `triggerLabel` is the accessible name
of the trigger and the text becomes its description; without a `triggerLabel` the text is the accessible name.
With `hasTrigger`, `class` is applied to the trigger and `attributes.id` (default: a random id) to the tooltip.
Override the `trigger` block for the whole trigger markup (the rendered tooltip is available as `tooltip`), the
`triggerClass` block for the trigger's extra classes, the `triggerContent` block for custom trigger content and the `tooltipContent` block for rich tooltip content.
