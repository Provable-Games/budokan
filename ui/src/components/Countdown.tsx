import { useEffect, useState } from "react";

interface CountdownProps {
  targetTimestamp: number; // Unix timestamp in seconds
  label?: string;
  className?: string;
  labelPosition?: "horizontal" | "vertical";
}

interface TimeUnits {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

const Countdown = ({
  targetTimestamp,
  label,
  className = "",
  labelPosition = "horizontal"
}: CountdownProps) => {
  const [timeRemaining, setTimeRemaining] = useState<TimeUnits>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
  });

  useEffect(() => {
    const calculateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000);
      const difference = targetTimestamp - now;

      if (difference <= 0) {
        setTimeRemaining({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(difference / (60 * 60 * 24));
      const hours = Math.floor((difference % (60 * 60 * 24)) / (60 * 60));
      const minutes = Math.floor((difference % (60 * 60)) / 60);
      const seconds = Math.floor(difference % 60);

      setTimeRemaining({ days, hours, minutes, seconds });
    };

    // Calculate immediately
    calculateTimeRemaining();

    // Update every second
    const interval = setInterval(calculateTimeRemaining, 1000);

    return () => clearInterval(interval);
  }, [targetTimestamp]);

  const { days, hours, minutes, seconds } = timeRemaining;

  // Determine which units to show based on the time remaining
  const showDays = days > 0;
  const showHours = showDays || hours > 0;
  const showMinutes = showHours || minutes > 0;

  const countdownDisplay = (
    <div className="flex flex-row gap-1.5 items-center">
      {showDays && (
        <>
          <div className="flex flex-col items-center bg-brand/10 px-1.5 py-0.5 rounded min-w-[36px]">
            <span className="text-brand font-brand text-base leading-none">
              {days.toString().padStart(2, "0")}
            </span>
            <span className="text-brand-muted text-[9px] leading-none mt-0.5">
              DAYS
            </span>
          </div>
          <span className="text-brand font-brand text-base">:</span>
        </>
      )}
      {showHours && (
        <>
          <div className="flex flex-col items-center bg-brand/10 px-1.5 py-0.5 rounded min-w-[36px]">
            <span className="text-brand font-brand text-base leading-none">
              {hours.toString().padStart(2, "0")}
            </span>
            <span className="text-brand-muted text-[9px] leading-none mt-0.5">
              HRS
            </span>
          </div>
          <span className="text-brand font-brand text-base">:</span>
        </>
      )}
      {showMinutes && (
        <>
          <div className="flex flex-col items-center bg-brand/10 px-1.5 py-0.5 rounded min-w-[36px]">
            <span className="text-brand font-brand text-base leading-none">
              {minutes.toString().padStart(2, "0")}
            </span>
            <span className="text-brand-muted text-[9px] leading-none mt-0.5">
              MIN
            </span>
          </div>
          <span className="text-brand font-brand text-base">:</span>
        </>
      )}
      <div className="flex flex-col items-center bg-brand/10 px-1.5 py-0.5 rounded min-w-[36px]">
        <span className="text-brand font-brand text-base leading-none">
          {seconds.toString().padStart(2, "0")}
        </span>
        <span className="text-brand-muted text-[9px] leading-none mt-0.5">
          SEC
        </span>
      </div>
    </div>
  );

  // Render with different layouts based on labelPosition
  if (labelPosition === "vertical") {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && <span className="text-brand-muted text-sm">{label}</span>}
        {countdownDisplay}
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className={`flex flex-row gap-3 items-center ${className}`}>
      {label && <span className="text-brand-muted">{label}</span>}
      {countdownDisplay}
    </div>
  );
};

export default Countdown;
