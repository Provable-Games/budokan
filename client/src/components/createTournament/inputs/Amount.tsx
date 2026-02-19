import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AmountInputProps {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  label?: string;
  disabled?: boolean;
  minValue?: number;
}

const PREDEFINED_AMOUNTS = [
  { value: 0.25, label: "$0.25" },
  { value: 0.50, label: "$0.50" },
  { value: 1, label: "$1" },
  { value: 2.50, label: "$2.50" },
  { value: 5, label: "$5" },
];

const AmountInput = ({ value, onChange, label, disabled = false, minValue }: AmountInputProps) => {
  const visiblePresets = minValue
    ? PREDEFINED_AMOUNTS.filter((p) => p.value >= minValue)
    : PREDEFINED_AMOUNTS;

  return (
    <div className="flex flex-row items-center gap-2">
      {label && <Label>{label}</Label>}
      <div className="flex flex-row gap-2">
        {visiblePresets.map(({ value: presetValue, label }) => (
          <Button
            key={presetValue}
            type="button"
            variant={value === presetValue ? "default" : "outline"}
            className="px-2"
            disabled={disabled}
            onClick={() => onChange(presetValue)}
          >
            {label}
          </Button>
        ))}
      </div>
      <Input
        type="number"
        placeholder="0.0"
        min={minValue ?? 0}
        step="0.01"
        inputMode="decimal"
        className="w-[80px] p-1"
        disabled={disabled}
        value={value ?? ""}
        onChange={(e) => {
          const inputValue = e.target.value;
          if (inputValue === "") {
            onChange(undefined);
          } else {
            const parsed = parseFloat(inputValue);
            onChange(minValue ? Math.max(minValue, parsed) : parsed);
          }
        }}
      />
    </div>
  );
};

export default AmountInput;
