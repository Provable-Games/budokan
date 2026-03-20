import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { XIcon } from "@/components/Icons";

const buttonVariants = cva(
  "inline-flex items-center gap-2 whitespace-nowrap text-sm 3xl:text-lg font-medium transition-all duration-200 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-5 3xl:[&_svg]:size-8 [&_svg]:shrink-0 relative select-none",
  {
    variants: {
      variant: {
        default:
          "bg-brand text-brand-subtle hover:brightness-110 active:scale-[0.97] active:brightness-95 rounded-lg border border-brand/20 shadow-[0_1px_2px_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]",
        destructive:
          "bg-destructive text-white hover:brightness-110 active:scale-[0.97] rounded-lg border border-destructive/30 shadow-[0_1px_2px_rgba(0,0,0,0.2)]",
        outline:
          "bg-transparent text-brand hover:bg-brand/8 active:scale-[0.97] rounded-lg border border-brand/25 hover:border-brand/40 shadow-[0_1px_2px_rgba(0,0,0,0.1)]",
        ghost:
          "bg-transparent text-brand hover:bg-brand/8 active:scale-[0.97] rounded-lg",
        tab:
          "bg-transparent text-brand-muted hover:text-brand hover:bg-brand/5 rounded-t-lg rounded-b-none border-b-2 border-transparent data-[active=true]:border-brand data-[active=true]:text-brand transition-colors",
      },
      size: {
        default: "h-10 3xl:h-12 px-4 py-2",
        xs: "h-7 3xl:h-8 min-w-7 3xl:min-w-8 px-2 py-1 rounded-md [&_svg]:size-3.5 3xl:[&_svg]:size-5 text-xs",
        sm: "h-9 px-3",
        lg: "h-11 px-6",
        xl: "h-14 3xl:h-20 px-6 [&_svg]:size-8 3xl:[&_svg]:size-12 3xl:text-2xl",
        icon: "h-10 w-10 justify-center",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size, asChild = false, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

interface XShareButtonProps {
  text: string;
  className?: string;
}

const XShareButton: React.FC<XShareButtonProps> = ({ text, className }) => {
  const tweetUrl = `https://x.com/intent/tweet?text=${encodeURIComponent(
    text
  )}`;

  return (
    <Button
      className={`flex flex-row items-center gap-2 ${className}`}
      onClick={() => {
        window.open(tweetUrl, "_blank", "noopener noreferrer");
      }}
    >
      <XIcon />
      <span>Share</span>
    </Button>
  );
};

export { Button, buttonVariants, XShareButton };
