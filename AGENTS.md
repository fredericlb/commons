# General rules on development

- Prioritize using existing libraries whenever possible. When you found one, show its strengths and weaknesses and ask if you should include it. 
- Comments at the top of a file should summarize what the file is doing in less than 5 lines. If it is not possible to explain this clearly in <=5 lines, add a md file explaining it fully in docs/[topic].md
- Inline comments should be one-liners

# This repo

`commons` is the shared base for the `studio` and `phare` monorepos. It is
consumed as a **git submodule** mounted at `commons/`, and its packages are
declared in each consumer's npm workspaces — so they are used as raw TypeScript
source, with no build step. Keep it that way: adding a build to a package here
means adding one to both consumers.

Anything that only one monorepo needs does NOT belong here.
