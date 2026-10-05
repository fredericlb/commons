// The whole page a signed-out visitor sees: a card centred over the starfield, holding the app's
// name, a line of what to do, and whatever acts on it — a sign-in link, a registration form, a
// "server unreachable, retry". Every sign-in screen of every app is this one, so they all look
// alike: the starfield is not optional. See docs/sign-in-screen.md.

import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "./card";
import { cn } from "./lib/utils";
import { Starfield } from "./starfield";

export interface SignInScreenProps {
  /** The app's name, or what this screen is for ("Create an account"). */
  title: ReactNode;
  /** One line under the title: what the visitor is asked to do. */
  description?: ReactNode;
  /** The action: a sign-in button, a form, a retry. */
  children?: ReactNode;
  /** Below the card, over the stars: a language picker, a version. */
  footer?: ReactNode;
  /** Applied to the card, e.g. `text-center` or a wider `max-w-lg`. */
  className?: string;
}

export function SignInScreen({
  title,
  description,
  children,
  footer,
  className,
}: SignInScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 py-8">
      <Starfield />
      <Card className={cn("relative w-full max-w-md", className)}>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          {description ? (
            <CardDescription>{description}</CardDescription>
          ) : null}
        </CardHeader>
        {children}
      </Card>
      {footer ? <div className="relative text-white/80">{footer}</div> : null}
    </div>
  );
}
