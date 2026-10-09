# UI compatibility adapters

Docks uses [shadcn/ui](https://ui.shadcn.com/) components in `../ui/`, restyled
after the Sales CRM reference: Geist type, pill buttons with layered inset
highlights, tag tones, and dense tables. Tokens (colors, shadows, tag tones)
are in `src/app/globals.css`. Dark is the default theme. Marketing pages wrap
their content in `.light`, which re-applies the light tokens and turns off
`dark:` variants.

These adapters preserve the application's existing string-value form contracts
and compose core components for sessions, sync history, and grouped panels.
New views use core components directly. The only local extension to the core
Button is `pending`, which disables the button and sets `aria-busy`.
