# General rules on development

- Prioritize using existing libraries whenever possible. When you found one, show its strengths and weaknesses and ask if you should include it.
- **A source file over 500 lines is suspect.** Split it unless there is a reason not to, and say the reason.
- **Comments are in English**, everywhere.
- **A file header is at most 10 lines.** What the file does, and the one thing a reader would get wrong.
- **A comment inside the body is exactly one line.** No wrapped sentences, no JSDoc paragraphs.
- Long rationale goes to the package's `docs/` page, and the code points at it.

Never join a multi-line comment into one line to satisfy the rule: that makes an unreadable
500-character line and can swallow a `biome-ignore` directive. Condense to a sentence, move the
rest to a doc page.

# This repo

`commons` is the shared base for the `studio` and `phare` monorepos. It is
consumed as a **git submodule** mounted at `commons/`, and its packages are
declared in each consumer's npm workspaces — so they are used as raw TypeScript
source, with no build step. Keep it that way: adding a build to a package here
means adding one to both consumers.

Anything that only one monorepo needs does NOT belong here.
