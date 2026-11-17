import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";

const meta = {
  title: "UI/Input",
  component: Input,
  tags: ["autodocs"],
  args: {
    placeholder: "e.g. Summer demos",
  },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "Untitled session" },
};

export const FileType: Story = {
  args: { type: "file" },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "Locked" },
};
