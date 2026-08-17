# `AppHeader` — the shared app bar, and the hamburger on mobile

`@frediverse/ui/app-header` is the bar at the top of every SPA: the app's
name on the left, its top-level entries on the right. From `sm` (640 px) up
the entries are inline buttons; below, they collapse into a **hamburger menu**
(`@frediverse/ui/hamburger-menu`, which the bar composes and which stands on
its own too). One component, so every app gets the same mobile behaviour
without each of them re-deciding it.

## Two looks

- `variant="accent"` (default) — primary background, white text. For an app
  whose bar *is* the brand colour (emplois).
- `variant="plain"` — card background, a rule underneath, foreground text.
  For an app whose page carries the colour and whose bar should stay quiet
  (routine, calepin, douane).

`contained` caps and centres the bar's content at `max-w-3xl`, for an app whose
page is a centred column and wants the bar aligned with it.

## What goes where

| prop | what it is | on a phone |
| --- | --- | --- |
| `title` | the app's name; a `<Link>` is fine | always shown |
| `subtitle` | a status or a build stamp beside the name | hidden under 420 px |
| `items` | the **pages / top-level actions** | behind the hamburger |
| `actions` | controls that must stay reachable — lock, locale, "new…" | inline, after the hamburger |
| `children` | anything else, between the title and the entries | as given |

The line to hold: **a page goes in `items`, a control goes in `actions`.**
Putting pages in `actions` "so they stay visible" is how a bar ends up with
seven icons on a 360 px screen — which is exactly what the hamburger exists
to avoid.

## Items

`AppHeaderItem` is `HamburgerMenuItem`:

```ts
{ label, icon?, onClick, active?, separatorBefore?, danger?, trailing? }
```

- `active` — the entry the app is on. Pressed (`secondary`) inline on the plain
  variant, tinted on accent, ticked in the menu; both carry `aria-current`.
- `separatorBefore` — a rule above the entry in the menu, to keep "log out"
  apart from the pages. Inline it does nothing.
- `danger` — destructive colouring, inline and in the menu.
- `trailing` — a node drawn after the label, inline and in the menu: a count, a
  badge, a dot. In the menu it sits before the tick, so a column still aligns.

  A node and not a number, because what goes there belongs to the app — st0
  draws how many items each section holds, muted and tabular. It is kept OUT of
  `label` on purpose: the label is the string the menu ticks and `aria-current`
  announces, so a count folded into it would be read aloud as part of the page's
  name and would change every time the catalogue did.

Entries are plain `onClick`s on purpose: this package does not know which
router an app uses. An app on react-router passes `() => navigate("/x")` and
derives `active` from `useLocation()`.

## Storybook

`app-header.stories.tsx` has both variants at desktop and mobile widths, and
one with `actions` — the three shapes the apps actually use.
