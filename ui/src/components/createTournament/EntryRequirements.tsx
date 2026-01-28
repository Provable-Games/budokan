import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { StepProps } from "@/containers/CreateTournament";
import { USER, X, INFO } from "@/components/Icons";
import { displayAddress, feltToString, indexAddress } from "@/lib/utils";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { Search } from "lucide-react";
import TokenDialog from "@/components/dialogs/Token";
import { useDojo } from "@/context/dojo";
import {
  useGetTournaments,
  useGetTournamentsCount,
} from "@/dojo/hooks/useSqlQueries";
import { processTournamentFromSql } from "@/lib/utils/formatting";
import { processPrizesFromSql } from "@/lib/utils/formatting";
import Pagination from "@/components/table/Pagination";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import useUIStore from "@/hooks/useUIStore";
import { OptionalSection } from "@/components/createTournament/containers/OptionalSection";
import { getChecksumAddress, validateChecksumAddress } from "starknet";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  PRESET_EXTENSIONS,
  getExtensionAddresses,
  getOpusSupportedAssets,
} from "@/lib/extensionConfig";
import { SnapshotConfig } from "./extensions/SnapshotConfig";
import { ERC20BalanceConfig } from "./extensions/ERC20BalanceConfig";
import { OpusTrovesConfig } from "./extensions/OpusTrovesConfig";
import { CustomExtensionConfig } from "./extensions/CustomExtensionConfig";

const EntryRequirements = ({ form }: StepProps) => {
  const { namespace, selectedChainConfig } = useDojo();
  const [newAddress, setNewAddress] = React.useState("");
  const [tournamentSearchQuery, setTournamentSearchQuery] = useState("");
  const [gameFilters, setGameFilters] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { gameData, getGameImage } = useUIStore();
  const [addressError, setAddressError] = useState("");
  const [extensionError, setExtensionError] = useState("");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);

  const ENTRY_LIMIT_OPTIONS = [
    { value: 1, label: "1" },
    { value: 2, label: "2" },
    { value: 3, label: "3" },
    { value: 5, label: "5" },
    { value: 10, label: "10" },
  ];

  const { data: tournaments } = useGetTournaments({
    namespace: namespace,
    gameFilters: gameFilters,
    limit: 10,
    offset: (currentPage - 1) * 10,
    status: "all",
    active: true,
  });

  const { data: tournamentsCount } = useGetTournamentsCount({
    namespace: namespace,
  });

  const totalPages = Math.ceil(tournamentsCount / 10);

  const tournamentsData = tournaments.map((tournament) => {
    const processedTournament = processTournamentFromSql(tournament);
    const processedPrizes = processPrizesFromSql(
      tournament.prizes,
      tournament.id
    );
    return {
      tournament: processedTournament,
      prizes: processedPrizes,
      entryCount: Number(tournament.entry_count),
    };
  });

  const handleGatingTypeChange = (
    type: "token" | "tournament" | "addresses" | "extension"
  ) => {
    form.setValue("gatingOptions.type", type);

    form.setValue("gatingOptions.token", undefined);
    form.setValue("gatingOptions.tournament.requirement", "participated");
    form.setValue("gatingOptions.tournament.qualifying_mode", 2); // Default to ALL
    form.setValue("gatingOptions.tournament.top_positions", 0); // Default to 0 for participated
    form.setValue("gatingOptions.tournament.tournaments", []);
    form.setValue("gatingOptions.addresses", []);
    form.setValue("gatingOptions.extension", undefined);

    // If extension is selected, disable entry limit and set to 0
    if (type === "extension") {
      form.setValue("enableEntryLimit", false);
      form.setValue("gatingOptions.entry_limit", 0);
    } else {
      // For non-extension types, enable entry limit by default with a value of 1
      form.setValue("enableEntryLimit", true);
      form.setValue("gatingOptions.entry_limit", 1);
    }
  };

  const getTournamentStatus = (isStarted: boolean, isEnded: boolean) => {
    if (isEnded) return "Ended";
    if (isStarted) return "Live";
    return "Upcoming";
  };

  // Detect and restore active preset based on extension address
  React.useEffect(() => {
    if (form.watch("gatingOptions.type") === "extension") {
      const extensionAddress = form.watch("gatingOptions.extension.address");
      const extensionConfig = form.watch("gatingOptions.extension.config");

      if (extensionAddress) {
        const extensionAddresses = getExtensionAddresses(
          selectedChainConfig?.chainId ?? ""
        );

        // Check if it's ERC20 balance validator
        if (extensionAddress === extensionAddresses.erc20BalanceValidator) {
          setSelectedPreset("erc20_balance");
        } else if (
          extensionAddress === extensionAddresses.opusTrovesValidator
        ) {
          // Check if it's Opus Troves validator
          setSelectedPreset("opus_troves");
        } else {
          // Custom contract
          setSelectedPreset(null);
        }
      } else if (extensionConfig && !extensionAddress) {
        // Snapshot preset (has config but no address)
        setSelectedPreset("snapshot");
      }
    }
  }, [
    form.watch("gatingOptions.type"),
    form.watch("gatingOptions.extension.address"),
    selectedChainConfig?.chainId,
  ]);

  return (
    <FormField
      control={form.control}
      name="enableGating"
      render={({ field }) => (
        <FormItem className="flex flex-col sm:p-4">
          <OptionalSection
            label="Entry Requirements"
            description="Enable participation restrictions"
            checked={field.value}
            onCheckedChange={field.onChange}
          />

          {field.value && (
            <>
              <div className="w-full h-0.5 bg-brand/25" />
              <div className="space-y-4 p-4">
                <div className="flex flex-col sm:flex-row gap-4 sm:min-h-24">
                  <div className="flex flex-col gap-4 sm:w-1/2">
                    <div className="flex flex-row items-center gap-5">
                      <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                        Requirement Type
                      </FormLabel>
                      <FormDescription className="hidden sm:block">
                        Choose the requirement type for the tournament
                      </FormDescription>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <Button
                        type="button"
                        variant={
                          form.watch("gatingOptions.type") === "token"
                            ? "default"
                            : "outline"
                        }
                        onClick={() => handleGatingTypeChange("token")}
                      >
                        Token
                      </Button>
                      <Button
                        type="button"
                        variant={
                          form.watch("gatingOptions.type") === "tournament"
                            ? "default"
                            : "outline"
                        }
                        onClick={() => handleGatingTypeChange("tournament")}
                      >
                        Tournaments
                      </Button>
                      <Button
                        type="button"
                        variant={
                          form.watch("gatingOptions.type") === "addresses"
                            ? "default"
                            : "outline"
                        }
                        onClick={() => handleGatingTypeChange("addresses")}
                      >
                        Whitelist{" "}
                        <span className="hidden sm:inline">Addresses</span>
                      </Button>
                      <Button
                        type="button"
                        variant={
                          form.watch("gatingOptions.type") === "extension"
                            ? "default"
                            : "outline"
                        }
                        onClick={() => handleGatingTypeChange("extension")}
                      >
                        Extension
                      </Button>
                    </div>
                  </div>
                  <div className="hidden sm:block w-0.5 h-full bg-brand/25" />
                  <div className="sm:hidden w-full h-0.5 bg-brand/25" />

                  {/* Extension Type Selection - shown when extension is selected */}
                  {form.watch("gatingOptions.type") === "extension" && (
                    <div className="flex flex-col gap-4 sm:w-1/2">
                      <div className="flex flex-row items-center gap-5">
                        <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                          Extension Type
                        </FormLabel>
                        <FormDescription className="hidden sm:block">
                          Choose a preset extension or use a custom contract
                        </FormDescription>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={
                            selectedPreset === null ? "default" : "outline"
                          }
                          onClick={() => {
                            setSelectedPreset(null);
                            form.setValue(
                              "gatingOptions.extension.address",
                              ""
                            );
                            form.setValue("gatingOptions.extension.config", "");
                            setExtensionError("");
                          }}
                        >
                          Custom Contract
                        </Button>
                        {Object.entries(PRESET_EXTENSIONS).map(
                          ([key, config]) => (
                            <Button
                              key={key}
                              type="button"
                              variant={
                                selectedPreset === key ? "default" : "outline"
                              }
                              onClick={() => {
                                setSelectedPreset(key);
                                setExtensionError("");
                                // Reset config fields
                                form.setValue(
                                  "gatingOptions.extension.config",
                                  ""
                                );
                                // Address will be set by the component
                                form.setValue(
                                  "gatingOptions.extension.address",
                                  ""
                                );
                              }}
                            >
                              {config.name}
                            </Button>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Entry Limit - shown when extension is NOT selected */}
                  {form.watch("gatingOptions.type") !== "extension" && (
                    <FormField
                      control={form.control}
                      name="enableEntryLimit"
                      render={({ field }) => (
                        <FormItem className="space-y-0 flex flex-col gap-4 sm:w-1/2">
                          <div className="flex flex-col">
                            <div className="flex flex-row justify-between">
                              <div className="flex flex-row items-center gap-5">
                                <div className="flex flex-row items-center gap-2">
                                  <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                                    Entry Limit
                                  </FormLabel>
                                  <HoverCard openDelay={50} closeDelay={0}>
                                    <HoverCardTrigger asChild>
                                      <span className="w-4 h-4 text-brand-muted hover:text-brand cursor-help">
                                        <INFO />
                                      </span>
                                    </HoverCardTrigger>
                                    <HoverCardContent
                                      className="w-72 p-4 text-sm break-words"
                                      align="start"
                                      side="top"
                                    >
                                      <p className="text-muted-foreground whitespace-normal">
                                        Limits how many times each eligible
                                        address can enter.
                                        <br />
                                        <br />
                                        If disabled, participants have unlimited
                                        entries per requirement.
                                      </p>
                                    </HoverCardContent>
                                  </HoverCard>
                                </div>
                                <FormDescription className="hidden sm:block">
                                  Set an entry limit for the tournament
                                </FormDescription>
                              </div>
                              <FormControl>
                                <div className="flex flex-row items-center gap-2">
                                  <span className="uppercase text-neutral text-xs font-bold">
                                    Optional
                                  </span>
                                  <Switch
                                    size="sm"
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                  />
                                </div>
                              </FormControl>
                            </div>
                          </div>
                          {field.value && (
                            <FormField
                              control={form.control}
                              name="gatingOptions.entry_limit"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <div className="flex flex-col sm:flex-row items-center gap-5">
                                      <div
                                        className={`flex flex-row items-center justify-center sm:justify-start gap-2 sm:w-1/2`}
                                      >
                                        {ENTRY_LIMIT_OPTIONS.map(
                                          ({ value, label }) => (
                                            <Button
                                              key={value}
                                              type="button"
                                              variant={
                                                field.value === value
                                                  ? "default"
                                                  : "outline"
                                              }
                                              className="px-2 w-10 h-10 flex items-center justify-center"
                                              onClick={() => {
                                                field.onChange(value);
                                              }}
                                            >
                                              {label}
                                            </Button>
                                          )
                                        )}
                                      </div>
                                      <div className="flex flex-col gap-2 w-1/2">
                                        <div className="flex justify-between items-center">
                                          <Label className="xl:text-xs 2xl:text-lg">
                                            Entries
                                          </Label>
                                          <span className="text-sm text-muted-foreground text-xl">
                                            {field.value ?? 0}
                                          </span>
                                        </div>
                                        <Slider
                                          value={[field.value ?? 0]}
                                          onValueChange={([entries]) => {
                                            field.onChange(entries);
                                          }}
                                          max={100}
                                          min={1}
                                          step={1}
                                        />
                                      </div>
                                    </div>
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          )}
                        </FormItem>
                      )}
                    />
                  )}
                </div>

                {form.watch("gatingOptions.type") === "token" && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="flex flex-row items-center gap-5">
                      <FormField
                        control={form.control}
                        name="gatingOptions.token"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <div className="flex flex-row items-center gap-5">
                                <TokenDialog
                                  selectedToken={field.value}
                                  onSelect={(token) => {
                                    field.onChange(token);
                                  }}
                                  type="erc721"
                                />
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}

                {form.watch("gatingOptions.type") === "tournament" && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="space-y-4">
                      <div className="flex flex-col sm:flex-row gap-4 sm:h-24">
                        <FormField
                          control={form.control}
                          name="gatingOptions.tournament.requirement"
                          render={({ field }) => (
                            <FormItem className="flex flex-col gap-4 sm:w-1/2">
                              <div className="flex flex-row items-center gap-5">
                                <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                                  Requirement
                                </FormLabel>
                                <FormDescription className="hidden sm:block">
                                  Participated or Top Position
                                </FormDescription>
                              </div>
                              <FormControl>
                                <div className="flex gap-2 items-center">
                                  <Button
                                    type="button"
                                    variant={
                                      field.value === "participated"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => {
                                      field.onChange("participated");
                                      // Reset top_positions to 0 for participated
                                      form.setValue(
                                        "gatingOptions.tournament.top_positions",
                                        0
                                      );
                                    }}
                                  >
                                    Participated
                                  </Button>
                                  <Button
                                    type="button"
                                    variant={
                                      field.value === "won"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => {
                                      field.onChange("won");
                                      // Set default top_positions to 1 for won
                                      if (
                                        !form.watch(
                                          "gatingOptions.tournament.top_positions"
                                        ) ||
                                        form.watch(
                                          "gatingOptions.tournament.top_positions"
                                        ) === 0
                                      ) {
                                        form.setValue(
                                          "gatingOptions.tournament.top_positions",
                                          1
                                        );
                                      }
                                    }}
                                  >
                                    Top Position
                                  </Button>
                                  {form.watch(
                                    "gatingOptions.tournament.requirement"
                                  ) === "won" && (
                                    <div
                                      className="flex flex-col gap-1 ml-2"
                                      style={{ width: "220px" }}
                                    >
                                      <div className="flex gap-1">
                                        {[1, 3, 5, 10, 20].map((value) => (
                                          <Button
                                            key={value}
                                            type="button"
                                            variant={
                                              form.watch(
                                                "gatingOptions.tournament.top_positions"
                                              ) === value
                                                ? "default"
                                                : "outline"
                                            }
                                            className="px-1 h-6 text-xs flex items-center justify-center flex-1"
                                            onClick={() => {
                                              form.setValue(
                                                "gatingOptions.tournament.top_positions",
                                                value
                                              );
                                            }}
                                          >
                                            {value}
                                          </Button>
                                        ))}
                                      </div>
                                      <div className="flex items-center gap-2">
                                        <Slider
                                          value={[
                                            form.watch(
                                              "gatingOptions.tournament.top_positions"
                                            ) ?? 1,
                                          ]}
                                          onValueChange={([positions]) => {
                                            form.setValue(
                                              "gatingOptions.tournament.top_positions",
                                              positions
                                            );
                                          }}
                                          max={200}
                                          min={1}
                                          step={1}
                                          className="flex-1"
                                        />
                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                          Top{" "}
                                          {form.watch(
                                            "gatingOptions.tournament.top_positions"
                                          ) ?? 1}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <div className="hidden sm:block w-0.5 h-full bg-brand/25" />
                        <div className="sm:hidden w-full h-0.5 bg-brand/25" />
                        <FormField
                          control={form.control}
                          name="gatingOptions.tournament.qualifying_mode"
                          render={({ field }) => (
                            <FormItem className="flex flex-col gap-4 sm:w-1/2">
                              <div className="flex flex-row items-center gap-5">
                                <div className="flex flex-row items-center gap-2">
                                  <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                                    Qualifying Mode
                                  </FormLabel>
                                  <HoverCard openDelay={50} closeDelay={0}>
                                    <HoverCardTrigger asChild>
                                      <span className="w-4 h-4 text-brand-muted hover:text-brand cursor-help">
                                        <INFO />
                                      </span>
                                    </HoverCardTrigger>
                                    <HoverCardContent
                                      className="w-80 p-4 text-sm"
                                      align="start"
                                      side="top"
                                    >
                                      <div className="flex flex-col gap-2">
                                        <div>
                                          <span className="font-semibold">
                                            All:
                                          </span>{" "}
                                          Must qualify in all tournaments
                                        </div>
                                        <div>
                                          <span className="font-semibold">
                                            Cumulative per Entry:
                                          </span>{" "}
                                          Track entries per qualifying token ID
                                        </div>
                                      </div>
                                    </HoverCardContent>
                                  </HoverCard>
                                </div>
                                <FormDescription className="hidden sm:block">
                                  Evaluation mode
                                </FormDescription>
                              </div>
                              <FormControl>
                                <div className="flex gap-2 overflow-x-auto overflow-y-hidden">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      field.value === 2 ? "default" : "outline"
                                    }
                                    onClick={() => field.onChange(2)}
                                  >
                                    All
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={
                                      field.value === 3 ? "default" : "outline"
                                    }
                                    onClick={() => field.onChange(3)}
                                  >
                                    Cumulative per Entry
                                  </Button>
                                </div>
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="w-full h-0.5 bg-brand/25" />
                      <FormField
                        control={form.control}
                        name="gatingOptions.tournament.tournaments"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex flex-row items-center gap-5">
                              <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                                Tournaments
                              </FormLabel>
                              <FormDescription>Add tournaments</FormDescription>
                            </div>
                            <FormControl>
                              <div className="flex gap-2">
                                <div className="flex flex-wrap gap-2">
                                  {(field.value || []).map(
                                    (selectedTournament) => {
                                      return (
                                        <div
                                          key={selectedTournament.id}
                                          className="inline-flex items-center gap-2 p-2 border border-brand-muted rounded w-fit"
                                        >
                                          <span>
                                            {feltToString(
                                              selectedTournament.metadata.name
                                            )}{" "}
                                            -{" "}
                                            {Number(
                                              selectedTournament.id
                                            ).toString()}
                                          </span>
                                          <span
                                            className="h-4 w-4 hover:cursor-pointer"
                                            onClick={() => {
                                              field.onChange(
                                                field.value.filter(
                                                  (v) =>
                                                    v !== selectedTournament
                                                )
                                              );
                                            }}
                                          >
                                            <X />
                                          </span>
                                        </div>
                                      );
                                    }
                                  )}
                                </div>

                                <Dialog>
                                  <DialogTrigger asChild>
                                    <Button
                                      variant="outline"
                                      type="button"
                                      disabled={
                                        !form.watch(
                                          "gatingOptions.tournament.requirement"
                                        )
                                      }
                                    >
                                      {!form.watch(
                                        "gatingOptions.tournament.requirement"
                                      )
                                        ? "Select requirement first"
                                        : "Select"}
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="h-[600px] flex flex-col gap-0 p-0">
                                    <DialogHeader className="flex-shrink-0">
                                      <DialogTitle className="p-4">
                                        Select Tournament
                                      </DialogTitle>
                                      {/* Search input */}
                                      <div className="px-4 pb-2 flex flex-col gap-2">
                                        <div className="flex items-center border rounded border-brand-muted bg-background">
                                          <Search className="w-4 h-4 ml-3 text-muted-foreground" />
                                          <Input
                                            placeholder="Search tournaments..."
                                            value={tournamentSearchQuery}
                                            onChange={(e) =>
                                              setTournamentSearchQuery(
                                                e.target.value
                                              )
                                            }
                                            className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                          />
                                        </div>
                                        <div className="w-full overflow-x-auto pb-2">
                                          <div className="flex flex-row gap-2 min-w-min">
                                            {gameData.map((game) => (
                                              <div
                                                key={game.contract_address}
                                                className={`h-8 flex-shrink-0 ${
                                                  gameFilters.includes(
                                                    game.contract_address
                                                  )
                                                    ? "bg-brand-muted text-black"
                                                    : "bg-black"
                                                } border border-brand-muted px-2 flex items-center gap-2 cursor-pointer`}
                                                onClick={() => {
                                                  if (
                                                    gameFilters.includes(
                                                      game.contract_address
                                                    )
                                                  ) {
                                                    setGameFilters(
                                                      gameFilters.filter(
                                                        (g) =>
                                                          g !==
                                                          game.contract_address
                                                      )
                                                    );
                                                  } else {
                                                    setGameFilters([
                                                      ...gameFilters,
                                                      game.contract_address,
                                                    ]);
                                                  }
                                                }}
                                              >
                                                {game.name}
                                                <span className="flex items-center justify-center">
                                                  <TokenGameIcon
                                                    size="xs"
                                                    image={getGameImage(
                                                      game.contract_address
                                                    )}
                                                  />
                                                </span>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </DialogHeader>

                                    {/* Tournament list */}
                                    <div className="flex-1 overflow-y-auto border-t border-brand-muted">
                                      {tournamentsData?.length > 0 ? (
                                        tournamentsData.map(
                                          (tournament, index) => {
                                            const isStarted =
                                              Number(
                                                tournament?.tournament.schedule
                                                  .game.start
                                              ) <
                                              Number(
                                                BigInt(Date.now()) / 1000n
                                              );

                                            const isEnded =
                                              Number(
                                                tournament.tournament.schedule
                                                  .game.end
                                              ) <
                                              Number(
                                                BigInt(Date.now()) / 1000n
                                              );
                                            const status = getTournamentStatus(
                                              isStarted,
                                              isEnded
                                            );
                                            const name = gameData.find(
                                              (game) =>
                                                game.contract_address ===
                                                tournament.tournament
                                                  .game_config.address
                                            )?.name;
                                            // const processedPrizes =
                                            //   processPrizesFromSql(
                                            //     tournament.prizes,
                                            //     tournament.tournament.id
                                            //   );
                                            // const entryFeePrizes =
                                            //   extractEntryFeePrizes(
                                            //     tournament?.tournament.id,
                                            //     tournament?.tournament
                                            //       .entry_fee,
                                            //     tournament?.entryCount
                                            //   );

                                            // const allPrizes = [
                                            //   ...entryFeePrizes,
                                            //   ...(processedPrizes ?? []),
                                            // ];

                                            // const groupedPrizes = groupPrizesByTokens(allPrizes, tokens);

                                            // const totalPrizesValueUSD = calculateTotalValue(groupedPrizes, prices);
                                            const beenSelected = (
                                              field.value || []
                                            ).some(
                                              (element) =>
                                                element.id ===
                                                tournament.tournament.id
                                            );
                                            const content = (
                                              <div
                                                key={index}
                                                className={`flex flex-row items-center justify-between border-b border-brand-muted ${
                                                  beenSelected
                                                    ? "bg-brand/70 text-black"
                                                    : "bg-background hover:bg-brand/20"
                                                } px-4 py-2 hover:cursor-pointer`}
                                                onClick={() => {
                                                  if (!beenSelected) {
                                                    field.onChange([
                                                      ...(field.value || []),
                                                      tournament.tournament,
                                                    ]);
                                                  }
                                                }}
                                              >
                                                <div className="flex flex-row items-center gap-2">
                                                  <span className="font-brand">
                                                    {feltToString(
                                                      tournament.tournament
                                                        .metadata.name
                                                    )}
                                                  </span>
                                                  -
                                                  <span className="font-brand">
                                                    #
                                                    {Number(
                                                      tournament.tournament.id
                                                    ).toString()}
                                                  </span>
                                                </div>
                                                <span className="font-brand">
                                                  {status}
                                                </span>
                                                <div className="flex flex-row">
                                                  <span className="w-6 h-6">
                                                    <USER />
                                                  </span>
                                                  {tournament.entryCount}
                                                </div>
                                                <div className="relative group flex items-center justify-center">
                                                  <Tooltip delayDuration={50}>
                                                    <TooltipTrigger asChild>
                                                      <div className="flex items-center justify-center">
                                                        <TokenGameIcon
                                                          size="sm"
                                                          image={getGameImage(
                                                            tournament
                                                              .tournament
                                                              .game_config
                                                              .address
                                                          )}
                                                        />
                                                      </div>
                                                    </TooltipTrigger>
                                                    <TooltipContent
                                                      side="top"
                                                      className="bg-black text-neutral border border-brand-muted px-2 py-1 rounded text-sm"
                                                    >
                                                      {name ? name : "Unknown"}
                                                    </TooltipContent>
                                                  </Tooltip>
                                                </div>
                                                {/* <div>${tournament.pot}</div> */}
                                              </div>
                                            );

                                            return beenSelected ? (
                                              content
                                            ) : (
                                              <DialogClose asChild key={index}>
                                                {content}
                                              </DialogClose>
                                            );
                                          }
                                        )
                                      ) : (
                                        <div className="flex items-center justify-center h-32 text-muted-foreground">
                                          No tournaments found
                                        </div>
                                      )}
                                    </div>
                                    <div className="px-4 pb-2 flex justify-center">
                                      <Pagination
                                        totalPages={totalPages}
                                        currentPage={currentPage}
                                        nextPage={() =>
                                          setCurrentPage(currentPage + 1)
                                        }
                                        previousPage={() =>
                                          setCurrentPage(currentPage - 1)
                                        }
                                        hasNextPage={currentPage < totalPages}
                                        hasPreviousPage={currentPage > 1}
                                      />
                                    </div>
                                  </DialogContent>
                                </Dialog>
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}

                {form.watch("gatingOptions.type") === "addresses" && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="space-y-4">
                      <FormField
                        control={form.control}
                        name="gatingOptions.addresses"
                        render={({ field }) => (
                          <FormItem>
                            <div className="flex flex-row items-center justify-between">
                              <div className="flex flex-row items-center gap-2 w-2/3">
                                <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                                  Whitelisted Addresses
                                </FormLabel>
                                <FormDescription className="hidden sm:block">
                                  Add addresses separated by commas or line
                                  breaks
                                </FormDescription>
                              </div>
                              {addressError && (
                                <div className="flex flex-row items-center gap-2 w-1/3 overflow-x-auto pb-2">
                                  <span className="text-red-500 text-sm">
                                    {addressError}
                                  </span>
                                </div>
                              )}
                            </div>
                            <FormControl>
                              <div className="flex flex-col gap-5">
                                <div className="flex flex-row gap-2">
                                  <Textarea
                                    className="h-20 w-3/4"
                                    placeholder="Enter addresses (separated by commas or line breaks)"
                                    value={newAddress}
                                    onChange={(e) =>
                                      setNewAddress(e.target.value)
                                    }
                                  />
                                  <div className="flex flex-col justify-between items-center">
                                    <span className="text-xs text-muted-foreground">
                                      Example: 0x123..., 0x456... or one address
                                      per line
                                    </span>
                                    <Button
                                      type="button"
                                      onClick={() => {
                                        if (newAddress) {
                                          // Split by comma or line break and trim whitespace
                                          const rawAddresses = newAddress
                                            .replace(/\r\n|\r|\n/g, ",") // Convert line breaks to commas
                                            .split(",")
                                            .map((addr) => addr.trim())
                                            .filter((addr) => addr.length > 0);

                                          // Validate each address and track invalid ones
                                          const validAddresses: string[] = [];
                                          const invalidAddresses: string[] = [];
                                          const duplicateAddresses: string[] =
                                            [];

                                          rawAddresses.forEach((rawAddr) => {
                                            try {
                                              // First try to convert to checksum address
                                              const addr =
                                                getChecksumAddress(rawAddr);

                                              // Then check if it's a valid address
                                              if (
                                                !validateChecksumAddress(addr)
                                              ) {
                                                invalidAddresses.push(rawAddr);
                                                return;
                                              }

                                              // Then check if it's already in the existing list
                                              if (
                                                field.value.some(
                                                  (existingAddr) =>
                                                    indexAddress(existingAddr).toLowerCase() ===
                                                    indexAddress(addr).toLowerCase()
                                                )
                                              ) {
                                                duplicateAddresses.push(
                                                  displayAddress(addr)
                                                );
                                              } else {
                                                // Only add if it's valid and not a duplicate
                                                validAddresses.push(addr);
                                              }
                                            } catch (e) {
                                              // If getChecksumAddress fails, add to invalid addresses
                                              invalidAddresses.push(rawAddr);
                                            }
                                          });

                                          // Also check for duplicates within the new addresses themselves
                                          const uniqueValidAddresses: string[] =
                                            [];
                                          const internalDuplicates: string[] =
                                            [];

                                          validAddresses.forEach((addr) => {
                                            if (
                                              uniqueValidAddresses.some(
                                                (existingAddr) =>
                                                  indexAddress(existingAddr).toLowerCase() ===
                                                  indexAddress(addr).toLowerCase()
                                              )
                                            ) {
                                              internalDuplicates.push(
                                                displayAddress(addr)
                                              );
                                            } else {
                                              uniqueValidAddresses.push(addr);
                                            }
                                          });

                                          if (internalDuplicates.length > 0) {
                                            duplicateAddresses.push(
                                              ...internalDuplicates
                                            );
                                          }

                                          // Construct error message
                                          let errorMessage = "";
                                          if (invalidAddresses.length > 0) {
                                            errorMessage += `Invalid addresses: ${invalidAddresses.join(
                                              ", "
                                            )}`;
                                          }
                                          if (duplicateAddresses.length > 0) {
                                            if (errorMessage)
                                              errorMessage += ". ";
                                            errorMessage += `Duplicate addresses: ${duplicateAddresses.join(
                                              ", "
                                            )}`;
                                          }

                                          if (uniqueValidAddresses.length > 0) {
                                            field.onChange([
                                              ...field.value,
                                              ...uniqueValidAddresses,
                                            ]);
                                            setNewAddress("");

                                            // Only show error if there were invalid or duplicate addresses
                                            if (errorMessage) {
                                              setAddressError(errorMessage);
                                            } else {
                                              setAddressError("");
                                            }
                                          } else {
                                            setAddressError(
                                              errorMessage ||
                                                "No valid addresses found"
                                            );
                                          }
                                        }
                                      }}
                                    >
                                      Add Addresses
                                    </Button>
                                  </div>
                                </div>
                                {field.value.length > 0 && (
                                  <>
                                    <div className="w-full h-0.5 bg-brand/25" />
                                    <div className="flex flex-row items-center justify-between">
                                      <div className="flex flex-col gap-2">
                                        <span className="text-sm">
                                          {field.value.length} address
                                          {field.value.length !== 1
                                            ? "es"
                                            : ""}{" "}
                                          added
                                        </span>
                                        <div className="flex flex-row gap-2 w-5/6">
                                          {field.value.map((address, index) => (
                                            <div
                                              key={index}
                                              className="flex items-center justify-between p-2 border border-neutral rounded w-fit"
                                            >
                                              <span className="truncate">
                                                {displayAddress(address)}
                                              </span>
                                              <span
                                                className="h-4 w-4 ml-2 hover:cursor-pointer"
                                                onClick={() => {
                                                  const newAddresses = [
                                                    ...field.value,
                                                  ];
                                                  newAddresses.splice(index, 1);
                                                  field.onChange(newAddresses);
                                                }}
                                              >
                                                <X />
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                      <div className="flex flex-col items-center w-1/6">
                                        <Button
                                          type="button"
                                          variant="outline"
                                          onClick={() => field.onChange([])}
                                        >
                                          Clear All
                                        </Button>
                                      </div>
                                    </div>
                                  </>
                                )}
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  </>
                )}

                {form.watch("gatingOptions.type") === "extension" && (
                  <>
                    <div className="w-full h-0.5 bg-brand/25" />
                    <div className="space-y-4">
                      {/* Snapshot Preset Configuration */}
                      {selectedPreset === "snapshot" && (
                        <SnapshotConfig extensionError={extensionError} />
                      )}

                      {/* ERC20 Balance Preset Configuration */}
                      {selectedPreset === "erc20_balance" && (
                        <ERC20BalanceConfig extensionError={extensionError} />
                      )}

                      {/* Opus Troves Preset Configuration */}
                      {selectedPreset === "opus_troves" && (
                        <OpusTrovesConfig
                          allowedAssetAddresses={getOpusSupportedAssets(
                            selectedChainConfig?.chainId ?? ""
                          )}
                          extensionError={extensionError}
                        />
                      )}

                      {/* Custom Contract Configuration */}
                      {selectedPreset === null && (
                        <CustomExtensionConfig
                          extensionError={extensionError}
                          onExtensionErrorChange={setExtensionError}
                        />
                      )}
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </FormItem>
      )}
    />
  );
};

export default EntryRequirements;
