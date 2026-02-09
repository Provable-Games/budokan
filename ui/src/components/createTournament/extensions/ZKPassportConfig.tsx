import { useState, useEffect, useCallback, useMemo } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ZKPASSPORT } from "@/components/Icons";
import { useDojo } from "@/context/dojo";
import { getExtensionAddresses } from "@/lib/extensionConfig";
import {
  ZKPASSPORT_SERVICE_SCOPE,
  ZKPASSPORT_SERVICE_SUBSCOPE,
  ZKPASSPORT_NULLIFIER_TYPE,
  ZKPASSPORT_DEFAULT_MAX_PROOF_AGE,
  ZKPASSPORT_VERIFIER_ADDRESSES,
} from "@/lib/zkpassport/constants";
import {
  type ZKPassportQueryConfig,
  serializeQueryConfig,
  deserializeQueryConfig,
  queryConfigToDescription,
} from "@/lib/zkpassport/queryConfig";
import { COUNTRY_LIST, COUNTRY_GROUP_PRESETS } from "@/lib/zkpassport/countries";

interface ZKPassportConfigProps {
  extensionError?: string;
}

type ConfigMode = "composable" | "custom";

// ─── Country Picker ────────────────────────────────────────────────────────

function CountryPicker({
  selected,
  onChange,
  label,
}: {
  selected: string[];
  onChange: (codes: string[]) => void;
  label: string;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(
    () =>
      search
        ? COUNTRY_LIST.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              c.code.toLowerCase().includes(search.toLowerCase()),
          )
        : COUNTRY_LIST,
    [search],
  );

  const toggle = (code: string) => {
    if (selected.includes(code)) {
      onChange(selected.filter((c) => c !== code));
    } else {
      onChange([...selected, code]);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-start text-left h-auto min-h-[2.5rem] py-1.5">
          {selected.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {selected.map((code) => (
                <Badge
                  key={code}
                  variant="default"
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(code);
                  }}
                >
                  {code} &times;
                </Badge>
              ))}
            </div>
          ) : (
            <span className="text-neutral/50">Select {label}...</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2" align="start">
        <Input
          placeholder="Search countries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-2"
        />
        {/* Presets */}
        <div className="flex flex-wrap gap-1 mb-2">
          {Object.entries(COUNTRY_GROUP_PRESETS).map(([key, preset]) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-6"
              onClick={() => {
                const merged = Array.from(new Set([...selected, ...preset.codes]));
                onChange(merged);
              }}
            >
              + {preset.label}
            </Button>
          ))}
          {selected.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-6"
              onClick={() => onChange([])}
            >
              Clear
            </Button>
          )}
        </div>
        {/* Country list */}
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {filtered.map((country) => {
            const isSelected = selected.includes(country.code);
            return (
              <button
                key={country.code}
                type="button"
                className={`w-full text-left px-2 py-1 text-xs rounded hover:bg-brand-muted/20 ${
                  isSelected ? "bg-brand-muted/30 font-medium" : ""
                }`}
                onClick={() => toggle(country.code)}
              >
                <span className="font-mono mr-1.5">{country.code}</span>
                {country.name}
                {isSelected && <span className="float-right">&#10003;</span>}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export const ZKPassportConfig = ({
  extensionError,
}: ZKPassportConfigProps) => {
  const { selectedChainConfig } = useDojo();
  const form = useFormContext();

  const [mode, setMode] = useState<ConfigMode>("composable");
  const [customCommitment, setCustomCommitment] = useState("");
  const [maxProofAge, setMaxProofAge] = useState(
    ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString(),
  );
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Composable state ──
  const [ageEnabled, setAgeEnabled] = useState(true);
  const [ageMin, setAgeMin] = useState("18");
  const [ageMax, setAgeMax] = useState("");

  const [nationalityEnabled, setNationalityEnabled] = useState(false);
  const [nationalityMode, setNationalityMode] = useState<"in" | "out">("in");
  const [nationalityCodes, setNationalityCodes] = useState<string[]>([]);

  const [issuingEnabled, setIssuingEnabled] = useState(false);
  const [issuingMode, setIssuingMode] = useState<"in" | "out">("in");
  const [issuingCodes, setIssuingCodes] = useState<string[]>([]);

  const [sanctionsEnabled, setSanctionsEnabled] = useState(false);

  // Advanced
  const [gender, setGender] = useState<"__none__" | "male" | "female">("__none__");
  const [documentType, setDocumentType] = useState<"__none__" | "passport" | "id_card" | "residence_permit" | "other">("__none__");
  const [birthdateAfter, setBirthdateAfter] = useState("");
  const [birthdateBefore, setBirthdateBefore] = useState("");
  const [expiryAfter, setExpiryAfter] = useState("");

  // Build config object from composable state
  const queryConfig = useMemo((): ZKPassportQueryConfig => {
    const cfg: ZKPassportQueryConfig = {};

    if (ageEnabled) {
      const min = parseInt(ageMin) || 0;
      const max = parseInt(ageMax) || 0;
      if (min > 0 && max > 0 && max > min) {
        cfg.age = { range: [min, max] };
      } else if (min > 0) {
        cfg.age = { gte: min };
      } else if (max > 0) {
        cfg.age = { lte: max };
      }
    }

    if (nationalityEnabled && nationalityCodes.length > 0) {
      cfg.nationality =
        nationalityMode === "in"
          ? { in: nationalityCodes }
          : { out: nationalityCodes };
    }

    if (issuingEnabled && issuingCodes.length > 0) {
      cfg.issuing_country =
        issuingMode === "in"
          ? { in: issuingCodes }
          : { out: issuingCodes };
    }

    if (sanctionsEnabled) {
      cfg.sanctions = { enabled: true };
    }

    if (gender && gender !== "__none__") {
      cfg.gender = { eq: gender };
    }

    if (documentType && documentType !== "__none__") {
      cfg.document_type = { eq: documentType };
    }

    if (birthdateAfter || birthdateBefore) {
      cfg.birthdate = {};
      if (birthdateAfter) cfg.birthdate.gte = birthdateAfter;
      if (birthdateBefore) cfg.birthdate.lte = birthdateBefore;
    }

    if (expiryAfter) {
      cfg.expiry_date = { gte: expiryAfter };
    }

    return cfg;
  }, [
    ageEnabled, ageMin, ageMax,
    nationalityEnabled, nationalityMode, nationalityCodes,
    issuingEnabled, issuingMode, issuingCodes,
    sanctionsEnabled, gender, documentType,
    birthdateAfter, birthdateBefore, expiryAfter,
  ]);

  const configDescription = useMemo(
    () => queryConfigToDescription(queryConfig),
    [queryConfig],
  );

  const updateFormConfig = useCallback(
    (currentMode: ConfigMode, commitment: string, proofAge: string, currentQueryConfig: ZKPassportQueryConfig) => {
      const extensionAddresses = getExtensionAddresses(
        selectedChainConfig?.chainId ?? "",
      );
      const validatorAddress = extensionAddresses.zkPassportValidator || "";

      const verifierAddress =
        ZKPASSPORT_VERIFIER_ADDRESSES[selectedChainConfig?.chainId ?? ""] || "0x0";
      const maxAge = proofAge || ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString();

      const paramCommitment = currentMode === "custom" ? commitment : "0x0";

      const configArray = [
        verifierAddress,
        ZKPASSPORT_SERVICE_SCOPE,
        ZKPASSPORT_SERVICE_SUBSCOPE,
        paramCommitment,
        maxAge,
        ZKPASSPORT_NULLIFIER_TYPE,
      ];

      // Append serialized query config for composable mode
      if (currentMode === "composable" && Object.keys(currentQueryConfig).length > 0) {
        const serialized = serializeQueryConfig(currentQueryConfig);
        configArray.push(...serialized);
      }

      const config = configArray.join(",");
      form.setValue("gatingOptions.extension.config", config);
      form.setValue("gatingOptions.extension.address", validatorAddress);
    },
    [selectedChainConfig?.chainId, form],
  );

  // Restore state from form on mount
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (!config) return;

    const parts = config.split(",");
    if (parts.length < 6) return;

    const proofAge = parts[4];
    setMaxProofAge(proofAge);

    if (parts.length > 6) {
      // Composable mode: deserialize query config
      setMode("composable");
      try {
        const queryConfigFelts = parts.slice(6);
        const decoded = deserializeQueryConfig(queryConfigFelts);

        if (decoded.age) {
          setAgeEnabled(true);
          if (decoded.age.range) {
            setAgeMin(decoded.age.range[0].toString());
            setAgeMax(decoded.age.range[1].toString());
          } else {
            if (decoded.age.gte !== undefined) setAgeMin(decoded.age.gte.toString());
            if (decoded.age.lte !== undefined) setAgeMax(decoded.age.lte.toString());
          }
        } else {
          setAgeEnabled(false);
        }

        if (decoded.nationality) {
          setNationalityEnabled(true);
          if (decoded.nationality.in) {
            setNationalityMode("in");
            setNationalityCodes(decoded.nationality.in);
          } else if (decoded.nationality.out) {
            setNationalityMode("out");
            setNationalityCodes(decoded.nationality.out);
          }
        }

        if (decoded.issuing_country) {
          setIssuingEnabled(true);
          if (decoded.issuing_country.in) {
            setIssuingMode("in");
            setIssuingCodes(decoded.issuing_country.in);
          } else if (decoded.issuing_country.out) {
            setIssuingMode("out");
            setIssuingCodes(decoded.issuing_country.out);
          }
        }

        if (decoded.sanctions?.enabled) setSanctionsEnabled(true);
        setGender(decoded.gender?.eq || "__none__");
        setDocumentType(decoded.document_type?.eq || "__none__");
        if (decoded.birthdate?.gte) setBirthdateAfter(decoded.birthdate.gte);
        if (decoded.birthdate?.lte) setBirthdateBefore(decoded.birthdate.lte);
        if (decoded.expiry_date?.gte) setExpiryAfter(decoded.expiry_date.gte);
      } catch {
        // Fall through
      }
    } else {
      // Legacy or custom mode
      const commitment = parts[3];
      if (commitment && commitment !== "0x0") {
        setMode("custom");
        setCustomCommitment(commitment);
      }
    }
  }, []); // Only on mount

  // Update form when config state changes
  useEffect(() => {
    updateFormConfig(mode, customCommitment, maxProofAge, queryConfig);
  }, [mode, customCommitment, maxProofAge, queryConfig, updateFormConfig]);

  return (
    <div className="space-y-4">
      <FormItem>
        <div className="flex flex-row items-center gap-3">
          <span className="w-6 h-6 text-brand">
            <ZKPASSPORT />
          </span>
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            ZK Passport
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Gate entry with zero-knowledge passport verification
          </FormDescription>
        </div>
        {extensionError && (
          <div className="flex flex-row items-center gap-2">
            <span className="text-red-500 text-sm">{extensionError}</span>
          </div>
        )}
      </FormItem>

      {/* Mode toggle */}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={mode === "composable" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("composable")}
        >
          Configure Requirements
        </Button>
        <Button
          type="button"
          variant={mode === "custom" ? "default" : "outline"}
          size="sm"
          onClick={() => setMode("custom")}
        >
          Custom Commitment
        </Button>
      </div>

      {mode === "custom" ? (
        // ── Custom mode: raw param commitment ──
        <FormItem>
          <FormLabel>Param Commitment</FormLabel>
          <FormControl>
            <Input
              placeholder="0x..."
              value={customCommitment}
              onChange={(e) => setCustomCommitment(e.target.value)}
            />
          </FormControl>
          <FormDescription className="text-xs">
            The Poseidon2 hash of the requirement parameters (hex)
          </FormDescription>
        </FormItem>
      ) : (
        // ── Composable mode ──
        <div className="space-y-3">
          {/* Summary */}
          {Object.keys(queryConfig).length > 0 && (
            <div className="text-xs text-brand-muted p-2 border border-brand/15 rounded bg-neutral/5">
              {configDescription}
            </div>
          )}

          {/* Age */}
          <div className="flex flex-col gap-2 p-3 border border-brand/15 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Age Requirement</span>
              <Switch
                checked={ageEnabled}
                onCheckedChange={setAgeEnabled}
                size="sm"
              />
            </div>
            {ageEnabled && (
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-brand-muted">Min</label>
                  <Input
                    type="number"
                    min="0"
                    max="150"
                    className="w-20 h-8"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-xs text-brand-muted">Max</label>
                  <Input
                    type="number"
                    min="0"
                    max="150"
                    placeholder="None"
                    className="w-20 h-8"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Nationality */}
          <div className="flex flex-col gap-2 p-3 border border-brand/15 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Nationality</span>
              <Switch
                checked={nationalityEnabled}
                onCheckedChange={setNationalityEnabled}
                size="sm"
              />
            </div>
            {nationalityEnabled && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={nationalityMode === "in" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setNationalityMode("in")}
                  >
                    Include
                  </Button>
                  <Button
                    type="button"
                    variant={nationalityMode === "out" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setNationalityMode("out")}
                  >
                    Exclude
                  </Button>
                </div>
                <CountryPicker
                  selected={nationalityCodes}
                  onChange={setNationalityCodes}
                  label="nationalities"
                />
              </div>
            )}
          </div>

          {/* Issuing Country */}
          <div className="flex flex-col gap-2 p-3 border border-brand/15 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Issuing Country</span>
              <Switch
                checked={issuingEnabled}
                onCheckedChange={setIssuingEnabled}
                size="sm"
              />
            </div>
            {issuingEnabled && (
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={issuingMode === "in" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setIssuingMode("in")}
                  >
                    Include
                  </Button>
                  <Button
                    type="button"
                    variant={issuingMode === "out" ? "default" : "outline"}
                    size="sm"
                    className="text-xs h-7"
                    onClick={() => setIssuingMode("out")}
                  >
                    Exclude
                  </Button>
                </div>
                <CountryPicker
                  selected={issuingCodes}
                  onChange={setIssuingCodes}
                  label="issuing countries"
                />
              </div>
            )}
          </div>

          {/* Sanctions */}
          <div className="flex flex-col gap-2 p-3 border border-brand/15 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Sanctions Check</span>
              <Switch
                checked={sanctionsEnabled}
                onCheckedChange={setSanctionsEnabled}
                size="sm"
              />
            </div>
            {sanctionsEnabled && (
              <p className="text-xs text-brand-muted mt-1">
                Players must not appear on international sanctions lists
              </p>
            )}
          </div>

          {/* Advanced */}
          <button
            type="button"
            className="text-xs text-brand-muted hover:text-brand transition-colors"
            onClick={() => setShowAdvanced(!showAdvanced)}
          >
            {showAdvanced ? "Hide" : "Show"} Advanced Options
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-brand/15">
              {/* Gender */}
              <FormItem>
                <FormLabel className="text-xs">Gender</FormLabel>
                <Select
                  value={gender}
                  onValueChange={(v) => setGender(v as typeof gender)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>

              {/* Document Type */}
              <FormItem>
                <FormLabel className="text-xs">Document Type</FormLabel>
                <Select
                  value={documentType}
                  onValueChange={(v) => setDocumentType(v as typeof documentType)}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Any" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any</SelectItem>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="id_card">ID Card</SelectItem>
                    <SelectItem value="residence_permit">Residence Permit</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>

              {/* Birthdate range */}
              <div className="flex flex-wrap items-center gap-2">
                <FormItem className="flex-1 min-w-[140px]">
                  <FormLabel className="text-xs">Born After</FormLabel>
                  <Input
                    type="date"
                    className="h-8"
                    value={birthdateAfter}
                    onChange={(e) => setBirthdateAfter(e.target.value)}
                  />
                </FormItem>
                <FormItem className="flex-1 min-w-[140px]">
                  <FormLabel className="text-xs">Born Before</FormLabel>
                  <Input
                    type="date"
                    className="h-8"
                    value={birthdateBefore}
                    onChange={(e) => setBirthdateBefore(e.target.value)}
                  />
                </FormItem>
              </div>

              {/* Expiry date */}
              <FormItem>
                <FormLabel className="text-xs">Passport Valid Until</FormLabel>
                <Input
                  type="date"
                  className="h-8"
                  value={expiryAfter}
                  onChange={(e) => setExpiryAfter(e.target.value)}
                />
                <FormDescription className="text-xs">
                  Passport must not expire before this date
                </FormDescription>
              </FormItem>
            </div>
          )}
        </div>
      )}

      {/* Max Proof Age */}
      <FormItem>
        <FormLabel>Max Proof Age (seconds)</FormLabel>
        <FormControl>
          <Input
            type="number"
            min="60"
            placeholder={ZKPASSPORT_DEFAULT_MAX_PROOF_AGE.toString()}
            value={maxProofAge}
            onChange={(e) => setMaxProofAge(e.target.value)}
          />
        </FormControl>
        <FormDescription className="text-xs">
          Maximum age of the ZK proof in seconds (default: 3600 = 1 hour)
        </FormDescription>
      </FormItem>
    </div>
  );
};
