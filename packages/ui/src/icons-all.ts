// @frediverse/ui/icons/all — every lucide icon by name, for an icon a person PICKS rather than one
// the code draws. Import it dynamically: it is ~1850 components, and only reaching them through this
// separate module keeps a static `@frediverse/ui/icons` import tree-shaken. See docs/icons.md.

// biome-ignore lint/style/noRestrictedImports: the sanctioned re-export of the per-icon index, which ships no declarations.
// @ts-expect-error — the same components `lucide-react` exports, from a file with no .d.ts beside it.
export * from "lucide-react/dist/esm/icons/index.mjs";
