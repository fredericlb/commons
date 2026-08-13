import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckCheck, LogOut } from "lucide-react";
import { AppHeader } from "./app-header";

const meta = {
  title: "UI/AppHeader",
  component: AppHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
  args: {
    title: "Fred-Emplois",
    subtitle: "12 offres à examiner",
    items: [
      {
        label: "Offres acceptées",
        icon: <CheckCheck className="size-4" />,
        onClick: () => {},
      },
      {
        label: "Déconnexion",
        icon: <LogOut className="size-4" />,
        onClick: () => {},
      },
    ],
  },
} satisfies Meta<typeof AppHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

export const TitleOnly: Story = {
  args: { subtitle: undefined, items: [] },
};
