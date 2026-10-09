# UI compatibility adapters

Docks uses core [shadcn/ui](https://ui.shadcn.com/) components, installed with
shadcn CLI 4.21.4 (new-york, neutral, Radix). Components are in `../ui/` and their
MIT license is retained there. The theme uses the standard neutral colors in
`src/app/globals.css`; charts use grayscale tokens.

These adapters preserve the application's existing string-value form contracts
and compose core components for sessions, sync history, and grouped panels.
New views should use core components directly. The only local extension to the
core Button is `pending`, which disables the button and sets `aria-busy` without
changing its default appearance.
