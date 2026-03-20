import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand/50 focus:ring-offset-2 focus:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "bg-brand/10 text-brand border border-brand/15",
        secondary:
          "bg-surface text-foreground border border-brand/10",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/20",
        success:
          "bg-success/15 text-success border border-success/20",
        warning:
          "bg-warning/15 text-warning border border-warning/20",
        outline: "text-brand-muted border border-brand-muted/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
