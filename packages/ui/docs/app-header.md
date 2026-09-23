# `AppHeader` — the shared app bar, and the hamburger on mobile

`@frediverse/ui/app-header` is the bar at the top of every SPA: the app's
name on the left, its top-level entries on the right. From `sm` (640 px) up
the entries are inline buttons; below, they collapse into a **hamburger menu**
(`@frediverse/ui/hamburger-menu`, which the bar composes and which stands on
its own too). One component, so every app gets the same mobile behaviour
without each of them re-deciding it.

## The look

- `variant="tint"` (default, the house look) — the accent at 20 % over the
  page, a matching rule underneath, foreground text. Every phare app uses it,
  full width.
- `variant="accent"` — solid primary, white text; `variant="plain"` — card
  background. Both kept for an app with a reason; none has one today.

The **name** is set in the brand face, `font-brand` — Nabla, a colour
(COLRv1) display font from Google Fonts. The token lives in `theme.css` with
Faster One and Palanquin as fallbacks, so an app that has not linked
`family=Nabla` in its `index.html` still gets a name, just not the coloured
one. It is for the name and nothing else: a colour font at body size is noise.

`contained` caps and centres the bar's content at `max-w-3xl`, for an app whose
page is a centred column and wants the bar aligned with it. The phare apps
went full width instead.

## The entries are tabs

Inline, each entry runs the bar's full height, and the active one is filled
with the **page** background (`bg-background`), square, outlined on its sides
and top in the colour of the bar's bottom rule, and open at the bottom, where it
covers that rule: it reads as a notebook tab the page hangs from, not as a
pressed button floating in the bar. The outline is drawn over the bar's own
fill (`bg-clip-padding`), which is what makes it the same shade as the rule.
Every entry carries a transparent border, so activating one shifts nothing. The nav
cancels the bar's `py-3` with negative margins and reaches 1 px further to
cover the rule, so the bar's padding and the tab's height move together.

It depends on the page actually being painted with `bg-background` right under
the bar; an app with a different page colour gets a tab that does not join it.

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
{ label, icon?, onClick, active?, separatorBefore?, danger?, trailing?, disabled? }
```

- `active` — the entry the app is on. Inline it is a **tab**, in every variant
  (below); in the menu it is ticked. Both carry `aria-current`.
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
- `disabled` — shown but inert, inline and in the menu: a view you cannot
  leave mid-task (acu's 3D while a quiz runs).

Entries are plain `onClick`s on purpose: this package does not know which
router an app uses. An app on react-router passes `() => navigate("/x")` and
derives `active` from `useLocation()`.

## Storybook

`app-header.stories.tsx` has both variants at desktop and mobile widths, and
one with `actions` — the three shapes the apps actually use.
