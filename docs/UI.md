# Docks UI

BoardUI free components are copied into `apps/web/src/components/base` and `application`, using the BoardUI CLI 0.5.8. Source: https://www.boardui.com/components/. License: [MIT](licenses/BoardUI-MIT.txt).

The shared UI adapters preserve existing form events, link composition, loading states, and table behavior. Buttons, input shells, chips, avatars, checklist checkboxes, filter selects, settings tabs, tooltips, and metric cards use BoardUI source. Existing complex review and issue grids retain their keyboard and selection behavior, using the same theme tokens. Unused template components and demo assets are excluded.

BoardUI theme and typography live in `src/styles`. `docks-theme.css` defines violet actions, lime brand details, warm light surfaces, and dark surfaces. Existing UI color aliases resolve to those semantic tokens. Status and diff colors retain their meaning.

The SVG mark combines a D with a review check. The app icon, SVG favicon, ICO favicon, and Apple touch icon share the same geometry.
