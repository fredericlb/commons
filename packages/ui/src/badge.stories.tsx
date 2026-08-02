import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./badge";

const meta = {
  title: "UI/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "amber", "rec", "tag"],
    },
  },
  args: {
    children: "badge",
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Amber: Story = {
  args: { variant: "amber", children: "paused" },
};

export const Rec: Story = {
  args: { variant: "rec", children: "● rec" },
};

export const Tag: Story = {
  args: { variant: "tag", children: "#riff" },
};

export const TagActive: Story = {
  args: {
    variant: "tag",
    children: "#riff",
    className: "border-primary bg-primary text-white",
  },
};

export const ClickableTag: Story = {
  args: { variant: "tag", asChild: true, children: <button>#clickme</button> },
};
