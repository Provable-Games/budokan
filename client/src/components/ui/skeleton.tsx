import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg bg-gradient-to-r from-brand/5 via-brand/10 to-brand/5 bg-[length:200%_100%] animate-shimmer",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
