import { cn } from "@/lib/utils";

export const LoadingSpinner = ({ className }: { className?: string }) => (
  <div
    className={cn(
      "animate-spin rounded-full border-b-2 border-black w-5 h-5",
      className
    )}
  />
);
