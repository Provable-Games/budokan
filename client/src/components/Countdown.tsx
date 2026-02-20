import { useEffect, useState } from "react";

interface CountdownProps {
  targetTimestamp: number; // Unix timestamp in seconds
  label?: string;
  className?: string;
  labelPosition?: "horizontal" | "vertical";
  size?: "xs" | "sm" | "md"; // Size variant for responsive layouts
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
  labelPosition = "horizontal",
  size = "md"
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

  // Size-dependent classes
  const sizeConfig = {
    xs: {
      unit: "min-w-[22px] px-0.5 py-0.5",
      number: "text-brand font-brand text-[10px] leading-none",
      label: "text-brand-muted text-[6px] leading-none",
      separator: "text-brand font-brand text-[10px]",
      gap: "gap-0.5",
    },
    sm: {
      unit: "min-w-[28px] px-1 py-0.5",
      number: "text-brand font-brand text-xs leading-none",
      label: "text-brand-muted text-[8px] leading-none mt-0.5",
      separator: "text-brand font-brand text-xs",
      gap: "gap-1",
    },
    md: {
      unit: "min-w-[36px] px-1.5 py-0.5",
      number: "text-brand font-brand text-base leading-none",
      label: "text-brand-muted text-[9px] leading-none mt-0.5",
      separator: "text-brand font-brand text-base",
      gap: "gap-1.5",
    },
  };

  const { unit: unitClasses, number: numberClasses, label: labelClasses, separator: separatorClasses, gap: gapClasses } = sizeConfig[size];

  const countdownDisplay = (
    <div className={`flex flex-row ${gapClasses} items-center`}>
      {showDays && (
        <>
          <div className={`flex flex-col items-center bg-brand/10 rounded ${unitClasses}`}>
            <span className={numberClasses}>
              {days.toString().padStart(2, "0")}
            </span>
            <span className={labelClasses}>
              DAYS
            </span>
          </div>
          <span className={separatorClasses}>:</span>
        </>
      )}
      {showHours && (
        <>
          <div className={`flex flex-col items-center bg-brand/10 rounded ${unitClasses}`}>
            <span className={numberClasses}>
              {hours.toString().padStart(2, "0")}
            </span>
            <span className={labelClasses}>
              HRS
            </span>
          </div>
          <span className={separatorClasses}>:</span>
        </>
      )}
      {showMinutes && (
        <>
          <div className={`flex flex-col items-center bg-brand/10 rounded ${unitClasses}`}>
            <span className={numberClasses}>
              {minutes.toString().padStart(2, "0")}
            </span>
            <span className={labelClasses}>
              MIN
            </span>
          </div>
          <span className={separatorClasses}>:</span>
        </>
      )}
      <div className={`flex flex-col items-center bg-brand/10 rounded ${unitClasses}`}>
        <span className={numberClasses}>
          {seconds.toString().padStart(2, "0")}
        </span>
        <span className={labelClasses}>
          SEC
        </span>
      </div>
    </div>
  );

  // Size-dependent wrapper label classes
  const wrapperLabelClasses = {
    xs: "text-brand-muted text-[10px]",
    sm: "text-brand-muted text-xs",
    md: "text-brand-muted text-sm",
  };
  const wrapperGapClasses = {
    xs: "gap-1",
    sm: "gap-1.5",
    md: "gap-3",
  };

  // Render with different layouts based on labelPosition
  if (labelPosition === "vertical") {
    return (
      <div className={`flex flex-col gap-0.5 ${className}`}>
        {label && <span className={wrapperLabelClasses[size]}>{label}</span>}
        {countdownDisplay}
      </div>
    );
  }

  // Horizontal layout (default)
  return (
    <div className={`flex flex-row ${wrapperGapClasses[size]} items-center ${className}`}>
      {label && <span className={wrapperLabelClasses[size]}>{label}</span>}
      {countdownDisplay}
    </div>
  );
};

export default Countdown;
