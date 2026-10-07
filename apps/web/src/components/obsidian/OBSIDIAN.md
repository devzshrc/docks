# ObsidianUI components (vendored)

Copied from the ObsidianUI registry (`https://www.obsidianui.dev/r/{name}.json`) on 2026-10-07 and edited in place:
`dashboard-shell`, `active-sessions`, `status-bars`, `discover-button`, `flip-text` (hover version from the docs; the registry JSON needs an unshipped stylesheet).

- `obsidian-theme.css` maps the library's palette variables onto our tokens in `app/globals.css`.
- `flip-text` is the docs' hover version, with aria-label and reduced-motion handling.
- `discover-button` has a local `size="sm"` and uses Next `Link` for internal hrefs.
- Landing page (`components/landing/`): `split-showcase`, `hover-img`, `draggable-marquee`, `text-stream` (gsap), also `discover-button` and `flip-text`. The JSX ones are loosely typed ports (`@ts-nocheck`).
- `flip-text` groups characters by word so headlines wrap between words only.
- Not installed: `art-gallery` (needs three.js and real artwork).
- Confirm the library's licence terms before shipping.
