import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field } from "./field";
import { Input } from "./input";
import { Textarea } from "./textarea";

const meta = {
  title: "UI/Field",
  component: Field,
  tags: ["autodocs"],
  args: {
    label: "Title",
    children: <Input placeholder="e.g. Summer demos" />,
  },
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithInput: Story = {};

export const WithTextarea: Story = {
  args: {
    label: "Description (optional)",
    children: <Textarea rows={3} />,
  },
};
