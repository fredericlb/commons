import type { Meta, StoryObj } from "@storybook/react-vite";
import { Input } from "./input";
import { Label } from "./label";

const meta = {
  title: "UI/Label",
  component: Label,
  tags: ["autodocs"],
  args: {
    children: "Title",
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithControl: Story = {
  render: (args) => (
    <div className="flex flex-col gap-1.5">
      <Label {...args} htmlFor="session-title" />
      <Input id="session-title" placeholder="e.g. Summer demos" />
    </div>
  ),
};
