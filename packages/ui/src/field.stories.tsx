import type { Meta, StoryObj } from "@storybook/react-vite";
import { Field, FieldHint } from "./field";
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

/** `htmlFor` points the caption at the control's id; hint and error sit under it. */
export const WithHintAndError: Story = {
  args: {
    label: "Username",
    htmlFor: "story-username",
    hint: "3 to 32 characters: a–z, 0–9, dot, dash.",
    error: "That name is taken.",
    children: <Input id="story-username" defaultValue="fred" />,
  },
};

/** A rule list: each `FieldHint` turns green with a check once it is met. */
export const WithRules: Story = {
  args: {
    label: "Password",
    htmlFor: "story-password",
    children: (
      <>
        <Input id="story-password" type="password" defaultValue="Secret" />
        <FieldHint ok>At least 1 uppercase letter</FieldHint>
        <FieldHint ok={false}>At least 1 digit</FieldHint>
      </>
    ),
  },
};
