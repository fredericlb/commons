import type { StorybookConfig } from "@storybook/react-vite";
import tailwindcss from "@tailwindcss/vite";

// The design-system Storybook: only the shared packages of this repo. Each
// consumer monorepo (studio, phare) runs its own Storybook for its app and
// app-local component stories — this one must stay app-agnostic.
const config: StorybookConfig = {
  stories: [
    "../packages/*/src/**/*.mdx",
    "../packages/*/src/**/*.stories.@(js|jsx|mjs|ts|tsx)",
  ],
  addons: [
    "@chromatic-com/storybook",
    "@storybook/addon-a11y",
    "@storybook/addon-docs",
    "@storybook/addon-mcp",
  ],
  framework: "@storybook/react-vite",
  // Standalone Vite pipeline — no app vite.config is involved. Tailwind v4 is
  // added so the design tokens (theme.css) and the utility classes used by the
  // stories compile.
  viteFinal: async (viteConfig) => {
    viteConfig.plugins = viteConfig.plugins ?? [];
    viteConfig.plugins.push(tailwindcss());

    // A component imported by bare specifier resolves via the workspace
    // symlink, so @vitejs/plugin-react skips it and Vite's own esbuild
    // transform handles it — and esbuild defaults to the *classic* JSX runtime,
    // which needs a global `React`. Since these components only import the hooks
    // they use, that throws "React is not defined" at render. Point Vite's
    // esbuild at the automatic runtime so JSX compiles to react/jsx-runtime.
    viteConfig.esbuild = {
      ...(viteConfig.esbuild || {}),
      jsx: "automatic",
      jsxImportSource: "react",
    };
    return viteConfig;
  },
};

export default config;
