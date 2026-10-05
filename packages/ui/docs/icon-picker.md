# `IconPicker` — choose an icon by name

`@frediverse/ui/icon-picker` lets a person pick any icon of the house set
(`@frediverse/ui/icons`, i.e. lucide) by name: a search field, then a capped
grid, "none" first. The chosen NAME is what an app stores; `useIcons()` turns
it back into a component when the app draws it.

```tsx
<IconPicker value={card.icon} onPick={(icon) => save({ ...card, icon })} />

const icons = useIcons();
const Icon = card.icon ? icons?.[card.icon] : undefined;
```

## The dynamic import, and what it does not buy

The set is reached through `import("./icons")`. That defers the module's
**execution** to the first picker, but it does not shrink the bundle in an app
that imports icons statically anywhere else — which is every app. Naming the
whole namespace keeps all ~1500 exports where tree-shaking would have kept
forty; Vite says so as `INEFFECTIVE_DYNAMIC_IMPORT`. Accepted: a curated
subset is a product decision, not a refactor.

## Names

Only components under their bare name are offered — `Lightbulb`, not
`LightbulbIcon` or `LucideLightbulb`, and no helpers. A name stored before
this picker existed (lucide's own `icons` map, which uses the same bare names)
resolves the same way.

## Labels

`placeholder`, `noneLabel` and `emptyLabel` default to English; pass them in
the app's language.
