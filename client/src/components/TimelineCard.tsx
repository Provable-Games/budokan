import { Card } from "@/components/ui/card";
import { ReactNode } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { formatTime } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface TimelineCardProps {
  icon: ReactNode;
  date?: Date;
  duraton?: number;
  label?: string;
  showConnector?: boolean;
  color?: string;
  active?: boolean;
  completed?: boolean;
  highlighted?: boolean;
  compact?: boolean;
}

const TimelineCard = ({
  icon,
  date,
  duraton,
  label,
  showConnector = false,
  active = false,
  completed = false,
  highlighted = false,
  compact = false,
}: TimelineCardProps) => {
  const cardSize = compact
    ? "h-6 w-6 sm:h-7 sm:w-7 lg:h-8 lg:w-8 3xl:h-10 3xl:w-10"
    : "h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 3xl:h-16 3xl:w-16";
  const connectorTop = compact
    ? "top-3 sm:top-3.5 lg:top-4 3xl:top-5"
    : "top-4 sm:top-5 lg:top-6 3xl:top-8";
  const dateSize = compact
    ? "text-[9px] sm:text-[10px]"
    : "text-[10px] sm:text-xs";
  const cardPadding = compact ? "p-1 sm:p-1.5" : "p-1.5 sm:p-2";
  return (
    <div className="relative flex flex-col items-center gap-2 pt-1">
      <Tooltip delayDuration={50}>
        <TooltipTrigger asChild>
          <Card
            variant={completed ? "default" : "outline"}
            className={`${cardPadding} bg-black ${
              completed
                ? "text-black bg-brand-muted"
                : highlighted
                  ? "text-brand border-brand shadow-lg shadow-brand/20 bg-gradient-to-br from-brand/20 to-black"
                  : "text-brand-muted"
            } ${cardSize} flex items-center justify-center z-20 cursor-pointer transition-all duration-300`}
          >
            {icon}
          </Card>
        </TooltipTrigger>
        {(date || label) && (
          <TooltipContent className="border-brand-muted bg-black text-brand 3xl:text-lg">
            <div className="flex flex-col gap-1">
              {label && (
                <span className="font-bold text-brand">
                  {label}
                  {duraton && duraton > 0 && (
                    <span className="ml-2 text-brand-muted">
                      ({formatTime(duraton)})
                    </span>
                  )}
                </span>
              )}
              {date && (
                <span className="text-brand-muted text-sm">
                  {label === "Registration"
                    ? "Opened: "
                    : label === "Preparation"
                      ? completed
                        ? "Ended: "
                        : "Starts: "
                      : label === "Tournament" || label === "Duration"
                        ? completed
                          ? "Started: "
                          : "Starts: "
                        : label === "Submission"
                          ? completed
                            ? "Ended: "
                            : "Ends: "
                          : !label
                            ? completed
                              ? "Ended: "
                              : "Ends: "
                            : ""}
                  {format(date, "dd/MM")} - {format(date, "HH:mm")}
                </span>
              )}
            </div>
          </TooltipContent>
        )}
      </Tooltip>
      {date && (
        <div className="flex flex-row items-center gap-1 font-brand whitespace-nowrap">
          <span className={dateSize}>{format(date, "dd/MM")}</span>
          <span className={`${dateSize} opacity-70`}>
            {format(date, "HH:mm")}
          </span>
        </div>
      )}
      {showConnector && (
        <motion.div
          className={`absolute ${connectorTop} left-1/2 h-0.5 border-t-2 border-dotted z-10 ${
            highlighted ? "border-brand" : "border-brand-muted"
          } ${active ? "animate-pulse" : ""}`}
          initial={{ width: 0 }}
          animate={{ width: "calc(100% + 2rem)" }}
          transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
        />
      )}
    </div>
  );
};

export default TimelineCard;
