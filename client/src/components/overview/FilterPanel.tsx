import { Check } from "lucide-react";
import useUIStore, {
  EntryFeeFilter,
  EntryRequirementFilter,
  RegistrationFilter,
} from "@/hooks/useUIStore";
import { GameButton } from "@/components/overview/gameFilters/GameButton";
import { cn } from "@/lib/utils";

interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-row gap-1 p-1 rounded-md border border-brand/15 bg-brand/[0.04]">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 inline-flex items-center justify-center h-7 rounded-sm text-[11px] font-semibold uppercase tracking-wider transition-colors",
            value === opt.value
              ? "bg-brand/20 text-brand shadow-[0_0_0_1px_rgba(225,249,128,0.25)]"
              : "text-brand-muted hover:text-brand hover:bg-brand/10",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

interface SectionProps {
  label: string;
  children: React.ReactNode;
}

const Section = ({ label, children }: SectionProps) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-[10px] uppercase tracking-wider text-brand-muted px-1">
      {label}
    </span>
    {children}
  </div>
);

const FilterPanel = () => {
  const {
    gameFilters,
    setGameFilters,
    gameData,
    filters,
    setFilter,
    resetFilters,
  } = useUIStore();

  const activeCount =
    gameFilters.length +
    (filters.entryFee !== "any" ? 1 : 0) +
    (filters.hasPrizes ? 1 : 0) +
    (filters.entryRequirement !== "any" ? 1 : 0) +
    (filters.registration !== "any" ? 1 : 0);

  const entryFeeOptions: SegmentedOption<EntryFeeFilter>[] = [
    { value: "any", label: "Any" },
    { value: "free", label: "Free" },
    { value: "paid", label: "Paid" },
  ];

  const requirementOptions: SegmentedOption<EntryRequirementFilter>[] = [
    { value: "any", label: "Any" },
    { value: "open", label: "Open" },
    { value: "restricted", label: "Gated" },
  ];

  const registrationOptions: SegmentedOption<RegistrationFilter>[] = [
    { value: "any", label: "Any" },
    { value: "open", label: "Open" },
    { value: "fixed", label: "Fixed" },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-row items-center justify-between px-1">
        <span className="text-[11px] uppercase tracking-wider text-brand">
          Filters
          {activeCount > 0 && (
            <span className="ml-2 inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full bg-brand text-black px-1 text-[10px] font-bold leading-none">
              {activeCount}
            </span>
          )}
        </span>
        {activeCount > 0 && (
          <button
            onClick={resetFilters}
            className="text-[10px] uppercase tracking-wider text-brand-muted hover:text-brand transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <Section label="Entry Fee">
        <SegmentedControl
          options={entryFeeOptions}
          value={filters.entryFee}
          onChange={(v) => setFilter("entryFee", v)}
        />
      </Section>

      <Section label="Prize Pool">
        <button
          onClick={() => setFilter("hasPrizes", !filters.hasPrizes)}
          className={cn(
            "inline-flex items-center justify-between gap-2 h-9 rounded-md border px-3 text-xs font-semibold uppercase tracking-wider transition-colors",
            filters.hasPrizes
              ? "bg-brand/15 border-brand/40 text-brand"
              : "bg-brand/5 border-brand/15 text-brand-muted hover:text-brand hover:bg-brand/10 hover:border-brand/30",
          )}
        >
          <span>Has Prize Pool</span>
          <span
            className={cn(
              "flex items-center justify-center w-4 h-4 rounded border",
              filters.hasPrizes
                ? "bg-brand border-brand text-black"
                : "border-brand/30",
            )}
          >
            {filters.hasPrizes && <Check className="w-3 h-3" />}
          </span>
        </button>
      </Section>

      <Section label="Entry Requirement">
        <SegmentedControl
          options={requirementOptions}
          value={filters.entryRequirement}
          onChange={(v) => setFilter("entryRequirement", v)}
        />
      </Section>

      <Section label="Registration">
        <SegmentedControl
          options={registrationOptions}
          value={filters.registration}
          onChange={(v) => setFilter("registration", v)}
        />
      </Section>

      <Section label="Game">
        <div className="flex flex-col gap-2 max-h-[280px] overflow-y-auto pr-1">
          {gameData?.map((game) => (
            <GameButton
              key={game.contract_address}
              game={game}
              gameFilters={gameFilters}
              setGameFilters={setGameFilters}
            />
          ))}
        </div>
      </Section>
    </div>
  );
};

export default FilterPanel;
