import * as React from "react";
import BorderImage from "@/components/icons/BorderImage";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const cardVariants = cva(
  "inline-flex flex-col gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors [border-style:solid] [border-image-slice:4] [border-image-width:4px] relative",
  {
    variants: {
      variant: {
        default: "bg-brand text-black border-2",
        destructive: "bg-destructive text-neutral-50 border-2",
        outline: "bg-black text-brand border-2 border-brand",
      },
      size: {
        default: "p-4",
        sm: "p-2",
        lg: "p-6",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const interactiveVariants = {
  default: "hover:bg-brand/90 hover:cursor-pointer",
  destructive: "hover:bg-destructive/90 hover:cursor-pointer",
  outline: "hover:bg-brand/10 hover:cursor-pointer",
} as const;

const disabledVariants = {
  default: "opacity-50 cursor-not-allowed",
  destructive: "opacity-50 cursor-not-allowed",
  outline: "opacity-50 cursor-not-allowed",
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
      variant,
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

    // Generate the border image dynamically
    const borderImage = `url("data:image/svg+xml,${BorderImage({
      variant: variant || "default",
    })}")`;

    return (
      <div
        className={cn(
          cardVariants({ variant, size, className }),
          interactive && variant ? interactiveVariants[variant] : "",
          disabled && variant ? disabledVariants[variant] : ""
        )}
        ref={ref}
        style={{
          borderImageSource: `${borderImage}`,
        }}
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
