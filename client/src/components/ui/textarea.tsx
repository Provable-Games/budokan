import * as React from "react";
import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-brand/15 bg-surface/60 px-3 py-2 text-base ring-offset-brand placeholder:text-neutral focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:border-brand/30 focus-visible:ring-offset-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
