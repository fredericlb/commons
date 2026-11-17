import type * as React from "react";

import markUrl from "./assets/frediverse-mark.png";
import { cn } from "./lib/utils";

// The Frediverse network mark (the "FV" monogram). This is the *family* mark, not
// an app icon: every app keeps its own icon, favicon and PWA icons, and this sits
// alongside them wherever an app says it belongs to the Frediverse — login gates,
// "Frediverse" mentions, lanes's corner watermark.
//
// The asset is the 192px export: the mark is only ever drawn at sm/default/lg
// (24/32/48px), so 192 covers retina at the largest of those and the 512 would be
// ~3x the bytes in every app bundle for no visible gain.
//
// Decorative by default — `aria-hidden`, because it sits next to a "Frediverse"
// wordmark that already carries the name, and a screen reader announcing it twice
// is noise. Pass a `label` where the mark stands alone with no adjacent text.
function FrediverseMark({
  className,
  size = "default",
  label,
  ...props
}: Omit<React.ComponentProps<"img">, "src" | "alt"> & {
  size?: "sm" | "default" | "lg";
  label?: string;
}) {
  return (
    <img
      data-slot="frediverse-mark"
      src={markUrl}
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      className={cn(
        "shrink-0 rounded-[22%] select-none",
        size === "sm" && "size-5",
        size === "default" && "size-8",
        size === "lg" && "size-12",
        className,
      )}
      {...props}
    />
  );
}

export { FrediverseMark };
