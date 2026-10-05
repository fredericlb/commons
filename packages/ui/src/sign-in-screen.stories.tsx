import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./button";
import { FrediverseMark } from "./frediverse-mark";
import { LocalePicker } from "./locale-picker";
import { SignInScreen } from "./sign-in-screen";

const meta = {
  title: "UI/SignInScreen",
  component: SignInScreen,
  parameters: { layout: "fullscreen" },
  args: {
    title: "phare — Sign in",
    description: "Sign in with your frediverse account.",
    children: (
      <Button className="w-full">
        <FrediverseMark size="sm" />
        Sign in
      </Button>
    ),
  },
} satisfies Meta<typeof SignInScreen>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

function Picker() {
  const [locale, setLocale] = useState<"en" | "fr">("en");
  return (
    <LocalePicker
      locale={locale}
      locales={["en", "fr"]}
      setLocale={setLocale}
    />
  );
}

/** A language picker under the card, over the stars. */
export const WithLocalePicker: Story = {
  args: { footer: <Picker /> },
};

export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
