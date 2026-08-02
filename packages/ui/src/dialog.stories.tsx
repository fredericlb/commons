import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "./dialog";

const meta = {
  title: "UI/Dialog",
  component: Dialog,
  tags: ["autodocs"],
} satisfies Meta<typeof Dialog>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Dialog open>
      <DialogTrigger asChild>
        <Button variant="outline">Delete session</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogTitle>Delete this session?</DialogTitle>
        <DialogDescription>
          This removes the recording and its annotations. This can't be undone.
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  ),
};
