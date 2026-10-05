import type { Meta, StoryObj } from "@storybook/react-vite";
import { Gamepad2, Library, Mic } from "./icons";
import { UserMenu } from "./user-menu";

const meta = {
  title: "UI/UserMenu",
  component: UserMenu,
  args: {
    email: "someone@example.org",
    onLogout: () => {},
    links: [
      {
        id: "library",
        label: "pl8",
        hint: "the media library",
        icon: Library,
        href: "#",
      },
      {
        id: "recorder",
        label: "k7",
        hint: "the rehearsal recorder",
        icon: Mic,
        href: "#",
      },
      { id: "game", label: "z0", icon: Gamepad2, href: "#" },
    ],
  },
} satisfies Meta<typeof UserMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** No other application: the account and the logout alone. */
export const NoLinks: Story = { args: { links: [] } };

/** Nowhere to go, and the reason in place of the links. */
export const Notice: Story = {
  args: { notice: "Pair this app with a server to reach the others." },
};
