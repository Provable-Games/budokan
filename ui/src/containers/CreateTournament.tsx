import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ARROW_LEFT } from "@/components/Icons";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, UseFormReturn } from "react-hook-form";
import * as z from "zod";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CHECK, MINUS } from "@/components/Icons";
import Details from "@/components/createTournament/Details";
import Schedule from "@/components/createTournament/Schedule";
import EntryRequirements from "@/components/createTournament/EntryRequirements";
import EntryFees from "@/components/createTournament/EntryFees";
import TournamentConfirmation from "@/components/dialogs/TournamentConfirmation";
import { processPrizes, processTournamentData } from "@/lib/utils/formatting";
import { useAccount } from "@starknet-react/core";
import { useSystemCalls } from "@/dojo/hooks/useSystemCalls";
import { Tournament } from "@/generated/models.gen";
import { useDojo } from "@/context/dojo";
import { FormToken } from "@/lib/types";
import {
  useGetPlatformMetrics,
  useGetPrizeMetrics,
} from "@/dojo/hooks/useSqlQueries";
import { getExtensionAddresses } from "@/lib/extensionConfig";

export type TournamentFormData = z.infer<typeof formSchema>;

export interface StepProps {
  form: UseFormReturn<TournamentFormData>;
  onNext?: () => void;
  onPrev?: () => void;
}

const formSchema = z.object({
  // Schedule step
  startTime: z.date(),
  enableEndTime: z.boolean().default(false),
  endTime: z.date(),
  duration: z.number().min(1).max(7776000), // 90 days
  type: z.enum(["open", "fixed"]),
  submissionPeriod: z.number().min(86400).max(604800), // 24 hours to 1 week
  registrationStartTime: z.date().optional(),
  registrationEndTime: z.date().optional(),

  // Details step
  game: z.string().min(2).max(66),
  settings: z.string(), // Changed to string for ID
  name: z.string().min(2).max(50),
  description: z.string().min(0).max(500),
  soulbound: z.boolean().default(false),
  play_url: z.string().url().optional().or(z.literal("")),

  // Other steps
  enableGating: z.boolean().default(false),
  enableEntryFees: z.boolean().default(false),
  enableEntryLimit: z.boolean().default(false),
  gatingOptions: z
    .object({
      entry_limit: z.number().min(1).max(100).optional(),
      type: z
        .enum(["token", "tournament", "addresses", "extension"])
        .optional(),
      token: z.custom<FormToken>().optional(),
      tournament: z
        .object({
          tournaments: z.array(z.custom<Tournament>()),
          requirement: z.enum(["participated", "won"]),
          qualifying_mode: z.number().min(0).max(5).default(0),
          top_positions: z.number().min(0).max(200).default(0),
        })
        .optional(),
      addresses: z.array(z.string()).default([]),
      extension: z
        .object({
          address: z.string().optional(),
          config: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  entryFees: z
    .object({
      token: z.custom<FormToken>().optional(),
      amount: z.number().min(0).optional(),
      value: z.number().min(0).optional(),
      tokenDecimals: z.number().min(0).max(18).optional(),
      creatorFeePercentage: z.number().min(0).max(100).optional(), // Stored as percentage (0-100), converted to basis points (0-10000) on submit
      gameFeePercentage: z.number().min(0).max(100).optional(), // Stored as percentage (0-100), converted to basis points (0-10000) on submit
      refundSharePercentage: z.number().min(0).max(100).optional(), // Stored as percentage (0-100), converted to basis points (0-10000) on submit
      prizePoolPayoutCount: z.number().min(1).max(1000).optional(), // Number of positions that receive prize pool payouts
      prizeDistribution: z
        .array(
          z.object({
            position: z.number(),
            percentage: z.number().min(0).max(100),
          })
        )
        .optional(),
      distributionType: z.enum(["linear", "exponential", "uniform"]).optional(),
      distributionWeight: z.number().min(0).max(50).optional(), // Weight for linear/exponential distributions (scaled by 10 for contract)
    })
    .optional(),
});

const CreateTournament = () => {
  const navigate = useNavigate();
  const { address } = useAccount();
  const { namespace, selectedChainConfig } = useDojo();
  const { createTournamentAndApproveAndAddPrizes } = useSystemCalls();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    shouldUnregister: false,
    defaultValues: {
      // Details step
      game: "",
      settings: "", // Just an ID string now
      name: "",
      description: "",
      soulbound: false,
      play_url: "",

      // Schedule step
      startTime: (() => {
        const now = new Date();
        now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5);
        return now;
      })(),
      enableEndTime: false,
      duration: 86400,
      type: "open",
      submissionPeriod: 86400,

      // Other steps
      enableGating: false,
      enableEntryFees: false,
      enableEntryLimit: true,
      gatingOptions: {
        entry_limit: 1,
        addresses: [],
        tournament: {
          tournaments: [],
          requirement: "participated",
          qualifying_mode: 0,
          top_positions: 0,
        },
        extension: {
          address: "",
          config: "",
        },
      },
      entryFees: {
        creatorFeePercentage: 0,
        gameFeePercentage: 1,
        refundSharePercentage: 0,
        prizePoolPayoutCount: 10,
        distributionType: "exponential",
        distributionWeight: 1,
      },
    },
  });

  const { data: platformMetricsModel } = useGetPlatformMetrics({
    namespace,
    active: true,
  });

  const { data: prizeMetricsModel } = useGetPrizeMetrics({
    namespace,
    active: true,
  });

  const tournamentCount = Number(platformMetricsModel?.total_tournaments ?? 0);
  const prizeCount = Number(prizeMetricsModel?.total_prizes ?? 0);

  // Add state for current step
  const [currentStep, setCurrentStep] = useState<
    "details" | "schedule" | "gating" | "fees"
  >("details");

  // Add state to track visited sections
  const [visitedSections, setVisitedSections] = useState<Set<string>>(
    new Set(["details"])
  );

  // Add state for confirmation dialog
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Helper to determine if we can proceed to next step
  const canProceed = () => {
    const status = getSectionStatus(form);
    switch (currentStep) {
      case "details":
        return status.details.complete;
      case "schedule":
        return status.schedule.complete;
      case "gating":
        return status.gating.complete;
      case "fees":
        return status.fees.complete;
    }
  };

  // Modify nextStep to track visited sections
  const nextStep = () => {
    switch (currentStep) {
      case "details":
        setVisitedSections((prev) => new Set([...prev, "schedule"]));
        setCurrentStep("schedule");
        break;
      case "schedule":
        setVisitedSections((prev) => new Set([...prev, "gating"]));
        setCurrentStep("gating");
        break;
      case "gating":
        setVisitedSections((prev) => new Set([...prev, "fees"]));
        setCurrentStep("fees");
        break;
      case "fees":
        setShowConfirmation(true);
        break;
    }
  };

  // Modify the section click handler to prevent skipping ahead
  const handleSectionClick = (section: string) => {
    const sectionOrder = ["details", "schedule", "gating", "fees"];
    const currentIndex = sectionOrder.indexOf(currentStep);
    const clickedIndex = sectionOrder.indexOf(section);

    // Allow clicking only on visited sections or the next unvisited section
    if (visitedSections.has(section) || clickedIndex <= currentIndex + 1) {
      setCurrentStep(section as any);
    }
  };

  const getStepIndex = (step: string): number => {
    const steps = ["details", "schedule", "gating", "fees"];
    return steps.indexOf(step);
  };

  // Render the current step's content
  const renderStep = () => {
    const steps = ["details", "schedule", "gating", "fees"];
    const currentIndex = getStepIndex(currentStep);

    // Only render current step and adjacent steps (previous and next)
    const visibleSteps = steps.filter((_, index) => {
      return Math.abs(index - currentIndex) <= 1;
    });

    return (
      <div className="relative h-full">
        {visibleSteps.map((step) => {
          const index = getStepIndex(step);
          const isActive = currentStep === step;
          const isPrevious = currentIndex > index;
          const isNext = currentIndex < index;

          return (
            <div
              key={step}
              className={cn(
                "transition-all duration-300 transform absolute w-full h-full overflow-y-auto pb-5 sm:pb-0",
                isActive &&
                  "translate-x-0 opacity-100 z-10 pointer-events-auto",
                isPrevious &&
                  "-translate-x-full opacity-0 z-0 pointer-events-none",
                isNext && "translate-x-full opacity-0 z-0 pointer-events-none"
              )}
            >
              <Card variant="outline" className="h-auto w-full">
                {step === "details" && <Details form={form} />}
                {step === "schedule" && <Schedule form={form} />}
                {step === "gating" && <EntryRequirements form={form} />}
                {step === "fees" && <EntryFees form={form} />}
              </Card>
            </div>
          );
        })}
      </div>
    );
  };

  const getSectionStatus = (form: any) => {
    // Helper function to safely check nested values
    const getValue = (path: string) => {
      const value = form.watch(path);
      return value !== undefined && value !== "" ? value : null;
    };

    return {
      details: {
        complete: !!(
          getValue("game") &&
          getValue("settings") &&
          getValue("name") &&
          getValue("description")
        ),
        enabled: true,
      },
      schedule: {
        complete:
          !!(getValue("startTime") && getValue("duration")) && getValue("type"),
        enabled: true,
      },
      gating: {
        complete:
          getValue("enableGating") === true
            ? (() => {
                const gatingType = getValue("gatingOptions.type");
                if (!gatingType) return false;

                switch (gatingType) {
                  case "token":
                    return !!getValue("gatingOptions.token");
                  case "tournament":
                    return (
                      !!getValue("gatingOptions.tournament.requirement") &&
                      Array.isArray(
                        getValue("gatingOptions.tournament.tournaments")
                      ) &&
                      getValue("gatingOptions.tournament.tournaments").length >
                        0
                    );
                  case "addresses":
                    return (
                      Array.isArray(getValue("gatingOptions.addresses")) &&
                      getValue("gatingOptions.addresses").length > 0
                    );
                  case "extension":
                    return !!(
                      getValue("gatingOptions.extension.address") ||
                      getValue("gatingOptions.extension.config")
                    );
                  default:
                    return false;
                }
              })()
            : true,
        enabled: getValue("enableGating") === true,
      },
      fees: {
        complete:
          getValue("enableEntryFees") === true
            ? !!(
                getValue("entryFees.token") &&
                getValue("entryFees.amount") &&
                getValue("entryFees.amount") > 0
              )
            : true,
        enabled: getValue("enableEntryFees") === true,
      },
    };
  };

  // Update the StatusIndicator component
  const StatusIndicator = ({ section }: { section: string }) => {
    const sectionOrder = ["details", "schedule", "gating", "fees"];
    const sectionIndex = sectionOrder.indexOf(section);
    const currentIndex = sectionOrder.indexOf(currentStep);

    // Only show check mark if we've moved past this section
    const isCompleted = sectionIndex < currentIndex;

    return (
      <div className="w-5 h-5 text-muted-foreground">
        {isCompleted ? <CHECK /> : <MINUS />}
      </div>
    );
  };

  // Add prevStep function
  const prevStep = () => {
    switch (currentStep) {
      case "schedule":
        setCurrentStep("details");
        break;
      case "gating":
        setCurrentStep("schedule");
        break;
      case "fees":
        setCurrentStep("gating");
        break;
    }
  };

  const handleCreateTournament = async () => {
    try {
      const formData = form.getValues();
      // Get extension addresses for the current chain
      const extensionAddresses = getExtensionAddresses(
        selectedChainConfig?.chainId ?? ""
      );
      // Process the tournament data
      const processedTournament = processTournamentData(
        formData,
        address!,
        Number(tournamentCount),
        extensionAddresses.tournamentValidator
      );
      // Process the prizes if they exist
      const processedPrizes = processPrizes(
        formData,
        Number(tournamentCount),
        Number(prizeCount)
      );
      await createTournamentAndApproveAndAddPrizes(
        processedTournament,
        processedPrizes,
        formData.entryFees?.value ?? 0,
        formData.duration
      );
      form.reset();
      setShowConfirmation(false);
      navigate(`/tournament/${Number(tournamentCount) + 1}`);
    } catch (error) {
      console.error("Error creating tournament:", error);
    }
  };

  return (
    <div className="flex flex-col gap-2 sm:gap-5 lg:w-[87.5%] xl:w-5/6 2xl:w-3/4 h-full mx-auto">
      <div className="flex flex-col gap-2 sm:gap-5">
        <div className="flex flex-row justify-between items-center">
          <Button variant="outline" onClick={() => navigate("/")}>
            <ARROW_LEFT />
            Home
          </Button>

          <div className="flex flex-row gap-2">
            {currentStep !== "details" && (
              <Button variant="outline" onClick={() => prevStep()}>
                <ARROW_LEFT />
                Previous
              </Button>
            )}
            <Button
              type="button"
              disabled={!canProceed()}
              onClick={() => {
                nextStep();
              }}
            >
              {currentStep === "fees" ? "Create" : "Next"}
            </Button>
            <TournamentConfirmation
              formData={form.getValues()}
              onConfirm={handleCreateTournament}
              open={showConfirmation}
              onOpenChange={setShowConfirmation}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="font-brand hidden sm:block lg:text-2xl xl:text-3xl 2xl:text-4xl 3xl:text-5xl font-bold">
            Create Tournament
          </span>

          <div className="flex items-center w-full justify-between h-10 sm:w-auto sm:gap-6">
            {Object.entries(getSectionStatus(form)).map(
              ([section, _status]) => (
                <div
                  key={section}
                  className={cn(
                    "flex items-center sm:gap-2 sm:text-sm capitalize",
                    visitedSections.has(section) || section === currentStep
                      ? "cursor-pointer"
                      : "cursor-not-allowed opacity-50",
                    currentStep === section && "border-b-2 border-brand"
                  )}
                  onClick={() => handleSectionClick(section)}
                >
                  <StatusIndicator section={section} />
                  <span>{section}</span>
                </div>
              )
            )}
          </div>
        </div>
      </div>

      <Form {...form}>
        <form className="flex flex-col gap-10 sm:pb-10 h-5/6 overflow-hidden">
          {renderStep()}
        </form>
      </Form>
    </div>
  );
};

export default CreateTournament;
