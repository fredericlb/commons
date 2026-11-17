import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "./lib/utils";

// default/amber/rec mirror the legacy .badge classes; tag mirrors .tag-chip
// (the violet "#tag" pill). Use asChild to render a clickable chip.
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] transition-colors [a&]:cursor-pointer [button&]:cursor-pointer",
  {
    variants: {
      variant: {
        default: "bg-secondary text-muted-foreground tabular-nums",
        amber: "bg-amber/15 text-amber tabular-nums",
        rec: "bg-destructive/15 text-destructive tabular-nums",
        tag: "border border-primary/35 bg-primary/20 font-semibold text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  asChild?: boolean;
}

function Badge({ className, variant, asChild = false, ...props }: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return (
    <Comp className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
