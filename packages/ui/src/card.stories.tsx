import type { Meta, StoryObj } from "@storybook/react-vite";
import { Card } from "./card";

const meta = {
  title: "UI/Card",
  component: Card,
  tags: ["autodocs"],
  args: {
    children: "Card content",
  },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithHeading: Story = {
  args: {
    children: (
      <>
        <h3 style={{ marginTop: 0 }}>Add a version</h3>
        <p className="muted small">Cards keep the legacy surface look.</p>
      </>
    ),
  },
};
