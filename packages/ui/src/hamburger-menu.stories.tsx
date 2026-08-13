import type { Meta, StoryObj } from "@storybook/react-vite";
import { CheckCheck, List, LogOut } from "lucide-react";
import { HamburgerMenu } from "./hamburger-menu";

const meta = {
  title: "UI/HamburgerMenu",
  component: HamburgerMenu,
  tags: ["autodocs"],
  args: {
    items: [
      {
        label: "Toutes les offres",
        icon: <List className="size-4" />,
        onClick: () => {},
      },
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
} satisfies Meta<typeof HamburgerMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
