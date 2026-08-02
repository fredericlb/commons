// @frediverse/ui — shadcn/ui primitives shared by the app and its packages.
//
// The app itself imports these via per-component subpaths (e.g.
// "@frediverse/ui/button"), matching shadcn's usual per-file convention. This barrel
// exists only as a single entry point for tooling that wants the whole
// package's export surface at once (type extraction, bundling for external
// consumption) — nothing in the frontend imports from it directly.

// Note: "./form" pulls in react-hook-form, which is an optional peer of this
// package — importing this barrel (rather than the per-component subpaths)
// therefore requires react-hook-form to be installed.

export * from "./alert";
export * from "./avatar";
export * from "./badge";
export * from "./button";
export * from "./calendar";
export * from "./card";
export * from "./checkbox";
export * from "./dialog";
export * from "./dropdown-menu";
export * from "./field";
export * from "./file-tree";
export * from "./form";
export * from "./frediverse-mark";
export * from "./input";
export * from "./label";
export * from "./popover";
export * from "./select";
export * from "./separator";
export * from "./sheet";
export * from "./switch";
export * from "./table";
export * from "./tabs";
export * from "./textarea";
export * from "./timeline";
export * from "./tooltip";
