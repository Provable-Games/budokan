import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "flex flex-col gap-2 text-sm font-medium transition-all duration-200 ease-out rounded-xl relative",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-brand-subtle border border-brand/20",
        destructive:
          "bg-destructive/10 text-neutral-50 border border-destructive/20",
        outline:
          "glass-surface text-brand",
      },
      size: {
        default: "p-4",
        sm: "p-2.5",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "outline",
      size: "default",
    },
  }
);

const interactiveVariants = {
  default: "hover:brightness-105 hover:cursor-pointer active:scale-[0.99]",
  destructive: "hover:bg-destructive/15 hover:cursor-pointer active:scale-[0.99]",
  outline: "hover:bg-surface/80 hover:border-brand/15 hover:cursor-pointer active:scale-[0.99] hover:shadow-[0_8px_32px_-8px_rgba(0,0,0,0.4)]",
} as const;

const disabledVariants = {
  default: "opacity-40 cursor-not-allowed",
  destructive: "opacity-40 cursor-not-allowed",
  outline: "opacity-40 cursor-not-allowed",
} as const;

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {
  interactive?: boolean;
  disabled?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  (
    {
      className,
      variant = "outline",
      size,
      interactive = false,
      disabled = false,
      onClick,
      children,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled) return;
      onClick?.(e);
    };

    return (
      <div
        className={cn(
          cardVariants({ variant, size, className }),
          interactive && variant ? interactiveVariants[variant] : "",
          disabled && variant ? disabledVariants[variant] : ""
        )}
        ref={ref}
        onClick={handleClick}
        {...(disabled ? { "aria-disabled": true } : {})}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = "Card";

export { Card, cardVariants };
