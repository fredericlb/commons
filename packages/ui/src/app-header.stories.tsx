import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  CheckCheck,
  InboxIcon,
  List,
  LockIcon,
  LogOut,
  SettingsIcon,
} from "lucide-react";
import { AppHeader } from "./app-header";
import { Button } from "./button";

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
        label: "Toutes les offres",
        icon: <List className="size-4" />,
        onClick: () => {},
        active: true,
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
        separatorBefore: true,
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

/** The solid accent bar, opt-in. */
export const Accent: Story = {
  args: { variant: "accent" },
};

/** The neutral card look, opt-in. */
export const Plain: Story = {
  args: {
    variant: "plain",
    contained: true,
    title: "routine",
    subtitle: "26.0815",
    items: [
      { label: "Todos", icon: "✅", onClick: () => {} },
      { label: "Budget", icon: "💰", onClick: () => {}, active: true },
      { label: "Food", icon: "🍽", onClick: () => {} },
      { label: "Sport", icon: "🏃", onClick: () => {} },
      { label: "Journal", icon: "📓", onClick: () => {} },
      { label: "Agenda", icon: "🗓", onClick: () => {} },
      {
        label: "Log out",
        icon: <LogOut className="size-4" />,
        onClick: () => {},
        separatorBefore: true,
      },
    ],
  },
};

export const PlainMobile: Story = {
  ...Plain,
  parameters: { viewport: { defaultViewport: "mobile1" } },
};

/** `actions` stay inline on every width — a lock button beside the hamburger. */
export const WithActions: Story = {
  args: {
    title: "🔐 calepin",
    subtitle: "dev",
    items: [
      {
        label: "Partages",
        icon: <InboxIcon className="size-4" />,
        onClick: () => {},
      },
      {
        label: "Réglages",
        icon: <SettingsIcon className="size-4" />,
        onClick: () => {},
      },
    ],
    actions: (
      <Button variant="outline" size="sm">
        <LockIcon />
        Verrouiller
      </Button>
    ),
  },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
