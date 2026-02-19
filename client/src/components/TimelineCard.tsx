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
}: TimelineCardProps) => {
  return (
    <div className="relative flex flex-col gap-2">
      <Tooltip delayDuration={50}>
        <TooltipTrigger asChild>
          <Card
            variant={completed ? "default" : "outline"}
            className={`p-1.5 sm:p-2 bg-black ${
              completed
                ? "text-black bg-brand-muted"
                : highlighted
                ? "text-brand border-brand shadow-lg shadow-brand/20 bg-gradient-to-br from-brand/20 to-black"
                : "text-brand-muted"
            } h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 3xl:h-16 3xl:w-16 flex items-center justify-center z-20 cursor-pointer transition-all duration-300`}
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
        <div className="flex flex-col items-center font-brand">
          <span className="text-[10px] sm:text-xs">{format(date, "dd/MM")}</span>
          <span className="text-[10px] sm:text-xs">{format(date, "HH:mm")}</span>
        </div>
      )}
      <div className={active ? "animate-pulse" : ""}>
        {showConnector && (
          <motion.div
            className={`absolute top-4 sm:top-5 lg:top-6 3xl:top-8 left-full w-full h-0.5 border-t-2 border-dotted z-10 transition-all duration-300 ${
              highlighted ? "border-brand" : "border-brand-muted"
            }`}
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 0.5, delay: 0.3, ease: "easeOut" }}
          />
        )}
      </div>
    </div>
  );
};

export default TimelineCard;
