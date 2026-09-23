import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FileTree, type TreeAction, type TreeNode } from "./file-tree";

const meta = {
  title: "UI/FileTree",
  component: FileTree,
  tags: ["autodocs"],
} satisfies Meta<typeof FileTree>;

export default meta;
type Story = StoryObj<typeof meta>;

const nodes: TreeNode[] = [
  {
    name: "Travail",
    path: "travail",
    dir: true,
    children: [
      { name: "Réunion du lundi", path: "travail/lundi" },
      { name: "Idées", path: "travail/idees" },
      {
        name: "2026",
        path: "travail/2026",
        dir: true,
        children: [{ name: "Objectifs", path: "travail/2026/objectifs" }],
      },
    ],
  },
  { name: "Courses", path: "courses" },
  { name: "Recettes", path: "recettes" },
];

const actions: TreeAction<TreeNode>[] = [
  {
    key: "new",
    label: "Nouvelle note…",
    prompt: {
      placeholder: "Titre",
      initial: () => "Sans titre",
      submit: "Créer",
    },
    run: () => undefined,
  },
  {
    key: "rename",
    label: "Renommer…",
    when: (t) => !t.root,
    prompt: { initial: (t) => t.name, submit: "Renommer" },
    run: () => undefined,
  },
  {
    key: "delete",
    label: (t) => `Supprimer ${t.name}…`,
    danger: true,
    when: (t) => t.dir && !t.root,
    // A folder can hold more than one row — nothing to type back, so this asks yes/no instead.
    confirm: {
      message: (t) => `Supprimer « ${t.name} » et tout ce qu'il contient ?`,
      submit: "Supprimer",
    },
    run: () => undefined,
  },
  {
    key: "delete-leaf",
    label: "Supprimer",
    danger: true,
    when: (t) => !t.dir && !t.root,
    run: () => undefined,
  },
];

/** The sidebar as calepin uses it: right-click a row for the menu. */
export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("travail/lundi");
    return (
      <div className="h-96 w-64 border border-border bg-card/40">
        <FileTree
          nodes={nodes}
          activePath={active}
          reveal={active}
          actions={actions}
          cancelLabel="Annuler"
          onOpen={(node) => setActive(node.path)}
          onMove={() => undefined}
        />
      </div>
    );
  },
};

/**
 * Both drops at once — a row moved within the tree, and OS files dropped in to upload — which is how lanes
 * uses it. Worth its own story because the two share one set of handlers and the first one added quietly took
 * the other's drops: `onMove` alone and `onDropFiles` alone each looked fine.
 */
export const WithUploads: Story = {
  render: () => {
    const [log, setLog] = useState<string[]>([]);
    const say = (line: string) => setLog((l) => [...l.slice(-4), line]);
    return (
      <div className="w-72">
        <div className="h-72 border border-border bg-card/40">
          <FileTree
            nodes={nodes}
            rootPath="."
            rootLabel="notes"
            actions={actions}
            cancelLabel="Annuler"
            onMove={(from, to) => say(`move ${from} → ${to}/`)}
            onDropFiles={(dir, files) =>
              say(`upload ${files.length} file(s) → ${dir}/`)
            }
          />
        </div>
        <ul
          data-testid="drop-log"
          className="mt-2 text-xs text-muted-foreground"
        >
          {log.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </div>
    );
  },
};

/** No menu, no drag: the tree degrades to plain navigation. */
export const ReadOnly: Story = {
  render: () => (
    <div className="h-96 w-64 border border-border bg-card/40">
      <FileTree nodes={nodes} activePath="courses" />
    </div>
  ),
};
