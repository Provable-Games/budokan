import { ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import DateTimeLabel from "./DateTimeLabel";

interface TimelineMarkerProps {
  position: number;
  date: Date | undefined;
  label: string;
  icon: ReactNode;
  iconBgColor: string;
  iconBorderColor?: string;
  iconTextColor?: string;
  iconSize?: string;
  borderColor?: string;
  zIndex?: string;
  transform?: string;
  offsetPixels?: number;
  isDragging?: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  calendarContent?: ReactNode;
}

const TimelineMarker = ({
  position,
  date,
  label,
  icon,
  iconBgColor,
  iconBorderColor = "border-neutral",
  iconTextColor = "text-white",
  iconSize = "w-6",
  borderColor = "brand",
  zIndex = "z-30",
  transform = "transform -translate-x-1/2",
  offsetPixels = 0,
  isDragging = false,
  onMouseDown,
  calendarContent,
}: TimelineMarkerProps) => {
  return (
    <div
      className={`absolute -top-16 flex flex-col items-center gap-2 ${zIndex} ${isDragging ? '' : 'transition-all'} ${transform}`}
      style={{
        left: `calc(${position}% + ${offsetPixels}px)`,
      }}
    >
      {calendarContent ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              className={`w-12 h-12 rounded-full ${iconBgColor} border-2 ${iconBorderColor} flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-all`}
            >
              <span className={`${iconSize} ${iconTextColor}`}>
                {icon}
              </span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="center">
            {calendarContent}
          </PopoverContent>
        </Popover>
      ) : (
        <button
          className={`w-12 h-12 rounded-full ${iconBgColor} border-2 ${iconBorderColor} flex items-center justify-center shadow-lg cursor-grab active:cursor-grabbing hover:scale-110 transition-all`}
          onMouseDown={onMouseDown}
        >
          <span className={`${iconSize} ${iconTextColor}`}>
            {icon}
          </span>
        </button>
      )}
      <DateTimeLabel
        date={date}
        label={label}
        borderColor={borderColor}
        onMouseDown={onMouseDown}
      />
    </div>
  );
};

export default TimelineMarker;
