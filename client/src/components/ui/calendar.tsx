import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, DayPickerSingleProps } from "react-day-picker";
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

export interface CalendarProps extends Omit<DayPickerSingleProps, "mode"> {
  onTimeChange?: (hour: number, minute: number) => void;
  selectedTime?: Date;
  minTime?: Date;
}

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  selectedTime = new Date(),
  onTimeChange,
  minTime,
  ...props
}: CalendarProps) {
  const [currentHour, setCurrentHour] = useState(format(selectedTime, "HH"));
  const [currentMinute, setCurrentMinute] = useState(format(selectedTime, "mm"));

  // Sync internal state with prop changes
  useEffect(() => {
    const newHour = format(selectedTime, "HH");
    const newMinute = format(selectedTime, "mm");

    // Only update if the values actually changed to avoid fighting with user input
    if (newHour !== currentHour || newMinute !== currentMinute) {
      setCurrentHour(newHour);
      setCurrentMinute(newMinute);
    }
  }, [selectedTime, currentHour, currentMinute]);

  const today = new Date();
  const fromMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  return (
    <DayPicker
      mode="single"
      showOutsideDays={showOutsideDays}
      className={cn("p-3", className)}
      fromMonth={fromMonth} // Disable navigation to previous months
      disabled={{ before: today }} // Disable selection of past dates
      onSelect={(date, selectedDay, activeModifiers, e) => {
        if (date && props.onSelect) {
          // When a new date is selected, adjust time if needed
          let adjustedTime = new Date(date);

          // If the selected date is the same as minTime's date, ensure time is valid
          if (
            minTime &&
            date.getDate() === minTime.getDate() &&
            date.getMonth() === minTime.getMonth() &&
            date.getFullYear() === minTime.getFullYear()
          ) {
            // Set time to at least minTime
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

              // Also update the parent's selectedTime
              if (onTimeChange) {
                onTimeChange(minTime.getHours(), minTime.getMinutes());
              }
            }
          }

          props.onSelect(date, selectedDay, activeModifiers, e);
        }
      }}
      classNames={{
        months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
        month: "space-y-4",
        caption: "flex gap-2 pt-1 relative items-center",
        caption_label: "flex items-center gap-2 text-sm font-medium",
        nav: "flex items-center gap-4",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-7 w-7 bg-transparent p-0 rounded-none"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
        table: "w-full border-collapse space-y-1",
        head_row: "flex justify-center",
        head_cell:
          "text-brand rounded-md w-9 font-normal text-[0.8rem] dark:text-neutral",
        row: "flex justify-center w-full mt-2",
        cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-neutral/50 [&:has([aria-selected])]:bg-brand first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 dark:[&:has([aria-selected].day-outside)]:bg-neutral/50 dark:[&:has([aria-selected])]:bg-neutral",
        day: "h-9 w-9 p-0 font-normal aria-selected:bg-brand-muted aria-selected:text-black rounded-none",
        day_range_end: "day-range-end",
        day_selected:
          "bg-brand text-black hover:bg-neutral hover:text-neutral-50 focus:bg-neutral focus:text-neutral-50",
        day_today: "text-neutral border border-brand-muted",
        day_outside:
          "day-outside text-neutral aria-selected:bg-neutral/50 aria-selected:text-neutral",
        day_disabled: "text-neutral opacity-50 dark:text-neutral",
        day_range_middle:
          "aria-selected:bg-neutral aria-selected:text-neutral dark:aria-selected:bg-neutral dark:aria-selected:text-neutral-50",
        day_hidden: "invisible",
        ...classNames,
      }}
      components={{
        IconLeft: ({ ...props }) => (
          <ChevronLeft className="h-4 w-4" {...props} />
        ),
        IconRight: ({ ...props }) => (
          <ChevronRight className="h-4 w-4" {...props} />
        ),
        CaptionLabel: ({ displayMonth }) => {
          const selectedDay = props.selected as Date | undefined;

          // Determine if time restrictions should apply
          const shouldRestrictTime = minTime && selectedDay;

          // Function to check if a specific hour/minute should be disabled
          const isTimeDisabled = (hour: number, minute: number): boolean => {
            if (!shouldRestrictTime || !selectedDay || !minTime) return false;

            // Create date objects with the same date but different times for comparison
            const selectedDate = new Date(selectedDay);
            selectedDate.setHours(hour, minute, 0, 0);

            // Compare the full datetime, not just hours and minutes
            return selectedDate < minTime;
          };

          return (
            <div className="flex flex-col items-start gap-2 w-full">
              <span className="text-base font-semibold">{format(displayMonth, "MMMM yyyy")}</span>
              {onTimeChange && (
                <div className="flex items-center gap-2 w-full">
                  <label className="text-xs text-neutral font-medium">Time:</label>
                  <Select
                    value={currentHour}
                    onValueChange={(hour) => {
                      setCurrentHour(hour);
                      onTimeChange(parseInt(hour), parseInt(currentMinute));
                    }}
                  >
                    <SelectTrigger className="w-auto [&>svg]:hidden w-[50px] px-2 h-8">
                      <SelectValue>
                        {currentHour}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {Array.from({ length: 24 }, (_, i) => (
                        <SelectItem
                          key={i}
                          value={i.toString().padStart(2, "0")}
                          disabled={isTimeDisabled(
                            i,
                            parseInt(currentMinute)
                          )}
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
                    <SelectTrigger className="w-auto [&>svg]:hidden w-[50px] px-2 h-8">
                      <SelectValue>
                        {currentMinute}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      {Array.from({ length: 12 }, (_, i) => i * 5).map(
                        (minute) => (
                          <SelectItem
                            key={minute}
                            value={minute.toString().padStart(2, "0")}
                            disabled={isTimeDisabled(
                              parseInt(currentHour),
                              minute
                            )}
                          >
                            {minute.toString().padStart(2, "0")}
                          </SelectItem>
                        )
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          );
        },
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
