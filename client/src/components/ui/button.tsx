import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import PressableBorderImage from "@/components/icons/PressableBorderImage";
import { cn } from "@/lib/utils";
import { XIcon } from "@/components/Icons";

const buttonVariants = cva(
  "inline-flex items-center gap-2 whitespace-nowrap rounded-xl text-sm 3xl:text-lg font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-5 3xl:[&_svg]:size-8 [&_svg]:shrink-0 [border-style:solid] [border-image-slice:4] [border-image-width:4px] relative active:top-[2px] active:left-[2px]",
  {
    variants: {
      variant: {
        default: "bg-brand text-black hover:bg-brand/90 border-2",
        destructive: "bg-destructive text-neutral-50 hover:opacity-90 border-2",
        outline: "bg-black text-brand hover:bg-brand/10 border-2 border-brand",
        tab: "[border-image-width:4px_4px_0_4px]",
      },
      size: {
        default: "h-10 3xl:h-12 px-2 sm:px-4 py-2",
        xs: "h-5 3xl:h-8 min-w-5 3xl:min-w-8 p-1 rounded-md [&_svg]:size-3 3xl:[&_svg]:size-5 [border-image-width:2px] text-xs",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        xl: "h-14 3xl:h-20 px-5 [&_svg]:size-8 3xl:[&_svg]:size-12 3xl:text-2xl",
        icon: "h-10 w-10",
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
    const [isPressed, setIsPressed] = React.useState(false);

    // Generate the border image dynamically
    const borderImage = `url("data:image/svg+xml,${PressableBorderImage({
      isPressed: isPressed,
      variant: variant,
    })}")`;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{
          borderImageSource: borderImage,
        }}
        onMouseDown={() => setIsPressed(true)}
        onMouseUp={() => setIsPressed(false)}
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
