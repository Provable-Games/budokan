import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import type { PropsBase } from "react-day-picker";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { useState, useEffect } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CalendarProps extends Omit<PropsBase, "mode"> {
  onTimeChange?: (hour: number, minute: number) => void;
  selectedTime?: Date;
  minTime?: Date;
  selected?: Date;
  onSelect?: (date: Date | undefined) => void;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  selectedTime = new Date(),
  onTimeChange,
  minTime,
  selected,
  onSelect,
  ...props
}: CalendarProps) {
  const [currentHour, setCurrentHour] = useState(format(selectedTime, "HH"));
  const [currentMinute, setCurrentMinute] = useState(format(selectedTime, "mm"));

  useEffect(() => {
    const newHour = format(selectedTime, "HH");
    const newMinute = format(selectedTime, "mm");

    if (newHour !== currentHour || newMinute !== currentMinute) {
      setCurrentHour(newHour);
      setCurrentMinute(newMinute);
    }
  }, [selectedTime, currentHour, currentMinute]);

  const today = new Date();
  const startMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const shouldRestrictTime = minTime && selected;

  const isTimeDisabled = (hour: number, minute: number): boolean => {
    if (!shouldRestrictTime || !selected || !minTime) return false;
    const selectedDate = new Date(selected);
    selectedDate.setHours(hour, minute, 0, 0);
    return selectedDate < minTime;
  };

  return (
    <div className={cn("p-3", className)}>
      <DayPicker
        mode="single"
        selected={selected}
        onSelect={(date) => {
          if (date && onSelect) {
            const adjustedTime = new Date(date);

            if (
              minTime &&
              date.getDate() === minTime.getDate() &&
              date.getMonth() === minTime.getMonth() &&
              date.getFullYear() === minTime.getFullYear()
            ) {
              if (
                adjustedTime.getHours() < minTime.getHours() ||
                (adjustedTime.getHours() === minTime.getHours() &&
                  adjustedTime.getMinutes() < minTime.getMinutes())
              ) {
                adjustedTime.setHours(
                  minTime.getHours(),
                  minTime.getMinutes(),
                  0,
                  0
                );
                if (onTimeChange) {
                  onTimeChange(minTime.getHours(), minTime.getMinutes());
                }
              }
            }

            onSelect(date);
          }
        }}
        showOutsideDays={showOutsideDays}
        navLayout="around"
        startMonth={startMonth}
        disabled={{ before: today }}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "grid grid-cols-[auto_1fr_auto] items-center gap-y-4",
          month_caption: "flex items-center justify-center",
          caption_label: "text-sm font-medium",
          button_previous: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 rounded-none inline-flex items-center justify-center"
          ),
          button_next: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 rounded-none inline-flex items-center justify-center"
          ),
          month_grid: "w-full border-collapse space-y-1 col-span-3",
          weekdays: "flex justify-center",
          weekday:
            "text-brand rounded-md w-9 font-normal text-[0.8rem] dark:text-neutral",
          week: "flex justify-center w-full mt-2",
          day: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-neutral/50 [&:has([aria-selected])]:bg-brand first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 dark:[&:has([aria-selected].day-outside)]:bg-neutral/50 dark:[&:has([aria-selected])]:bg-neutral",
          day_button: "h-9 w-9 p-0 font-normal aria-selected:bg-brand-muted aria-selected:text-black rounded-none",
          range_end: "day-range-end",
          selected:
            "bg-brand text-black hover:bg-neutral hover:text-neutral-50 focus:bg-neutral focus:text-neutral-50",
          today: "text-neutral border border-brand-muted",
          outside:
            "day-outside text-neutral aria-selected:bg-neutral/50 aria-selected:text-neutral",
          disabled: "text-neutral opacity-50 dark:text-neutral",
          range_middle:
            "aria-selected:bg-neutral aria-selected:text-neutral dark:aria-selected:bg-neutral dark:aria-selected:text-neutral-50",
          hidden: "invisible",
          ...classNames,
        }}
        components={{
          Chevron: ({ orientation }) => {
            if (orientation === "left") {
              return <ChevronLeft className="h-4 w-4" />;
            }
            return <ChevronRight className="h-4 w-4" />;
          },
        }}
        {...props}
      />
      {onTimeChange && (
        <div className="flex items-center gap-2 pt-3 px-1">
          <label className="text-xs text-neutral font-medium">Time:</label>
          <Select
            value={currentHour}
            onValueChange={(hour) => {
              setCurrentHour(hour);
              onTimeChange(parseInt(hour), parseInt(currentMinute));
            }}
          >
            <SelectTrigger className="w-[50px] [&>svg]:hidden px-2 h-8">
              <SelectValue>{currentHour}</SelectValue>
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {Array.from({ length: 24 }, (_, i) => (
                <SelectItem
                  key={i}
                  value={i.toString().padStart(2, "0")}
                  disabled={isTimeDisabled(i, parseInt(currentMinute))}
                >
                  {i.toString().padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-neutral font-bold">:</span>
          <Select
            value={currentMinute}
            onValueChange={(minute) => {
              setCurrentMinute(minute);
              onTimeChange(parseInt(currentHour), parseInt(minute));
            }}
          >
            <SelectTrigger className="w-[50px] [&>svg]:hidden px-2 h-8">
              <SelectValue>{currentMinute}</SelectValue>
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {Array.from({ length: 12 }, (_, i) => i * 5).map((minute) => (
                <SelectItem
                  key={minute}
                  value={minute.toString().padStart(2, "0")}
                  disabled={isTimeDisabled(parseInt(currentHour), minute)}
                >
                  {minute.toString().padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
