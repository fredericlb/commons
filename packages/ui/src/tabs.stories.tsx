import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

const meta = {
  title: "UI/Tabs",
  component: Tabs,
  tags: ["autodocs"],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="lyrics">
      <TabsList>
        <TabsTrigger value="lyrics">Lyrics</TabsTrigger>
        <TabsTrigger value="tablature">Tablature</TabsTrigger>
        <TabsTrigger value="sheet">Sheet</TabsTrigger>
      </TabsList>
      <TabsContent value="lyrics">Lyrics content</TabsContent>
      <TabsContent value="tablature">Tablature content</TabsContent>
      <TabsContent value="sheet">Sheet content</TabsContent>
    </Tabs>
  ),
};
