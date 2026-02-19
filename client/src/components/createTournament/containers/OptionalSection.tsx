import { Switch } from "@/components/ui/switch";
import { FormControl, FormDescription, FormLabel } from "@/components/ui/form";

interface OptionalSectionProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

export const OptionalSection = ({
  label,
  description,
  checked,
  onCheckedChange,
  className,
}: OptionalSectionProps) => {
  return (
    <div className={`flex flex-row items-center justify-between ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-5 w-full">
        <div className="flex flex-row items-center justify-between">
          <FormLabel className="font-brand text-lg sm:text-xl lg:text-2xl 2xl:text-3xl font-bold">
            {label}
          </FormLabel>
          <FormControl className="sm:hidden">
            <div className="flex flex-row items-center gap-2">
              <span className="uppercase text-neutral font-bold text-xs">
                Optional
              </span>
              <Switch checked={checked} onCheckedChange={onCheckedChange} />
            </div>
          </FormControl>
        </div>
        <FormDescription className="sm:text-sm xl:text-base">
          {description}
        </FormDescription>
      </div>
      <FormControl className="hidden sm:flex">
        <div className="flex flex-row items-center gap-2">
          <span className="uppercase text-neutral font-bold">Optional</span>
          <Switch checked={checked} onCheckedChange={onCheckedChange} />
        </div>
      </FormControl>
    </div>
  );
};
