import {
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import SmallSettingsTable from "./SmallSettingsTable";
import { UseFormReturn, ControllerRenderProps } from "react-hook-form";
import { useSettings } from "@provable-games/denshokan-sdk/react";
import { useGameSetting } from "@/hooks/useDenshokanQueries";
import { useEffect, useState } from "react";
import { SettingsDialog } from "@/components/dialogs/CreateSettings";
import { LoadingSpinner } from "@/components/ui/spinner";

interface GameSettingsFieldProps {
  form: UseFormReturn<any>;
  field: ControllerRenderProps<any, any>;
}

const GameSettingsField = ({ form, field }: GameSettingsFieldProps) => {
  const [open, setOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const settingsPerPage = 5;

  const gameAddress = form.watch("game");

  const settingsId = Number(field.value) || undefined;
  const { data: singleSetting } = useGameSetting({
    gameAddress,
    settingsId,
    active: !!gameAddress && settingsId !== undefined,
  });
  const setting = singleSetting ? [singleSetting] : [];

  const { data: settingsResult, isLoading: isLoadingSettings } = useSettings(
    gameAddress
      ? {
          gameAddress,
          limit: settingsPerPage,
          offset: (currentPage - 1) * settingsPerPage,
        }
      : undefined,
  );
  const settings = settingsResult?.data ?? null;
  const settingsCount = settingsResult?.total ?? 0;

  const totalPages = Math.ceil(settingsCount / settingsPerPage);

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [open]);

  const hasSettings = !!setting[0]?.settings;

  return (
    <>
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        game={form.watch("game")}
        settings={settings ?? []}
        value={field.value}
        onChange={field.onChange}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        settingsCount={settingsCount ?? 0}
        totalPages={totalPages}
        isLoadingSettings={isLoadingSettings}
      />
      <FormItem>
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Settings
          </FormLabel>
          <FormDescription className="sm:text-xs xl:text-sm 3xl:text-base">
            Select the game settings
          </FormDescription>
        </div>
        <FormControl>
          <div className="flex flex-col gap-4">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="flex flex-col">
                  <h3 className="font-brand text-lg">
                    {setting[0] ? setting[0]?.name : "Default"}
                  </h3>
                  <p className="text-sm text-brand-muted">
                    {setting[0]
                      ? setting[0]?.description
                      : "No settings available"}
                  </p>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => setOpen(true)}
                  disabled={!form.watch("game")}
                >
                  Select Settings
                </Button>
              </div>
              {isLoadingSettings ? (
                <LoadingSpinner className="w-10 h-10 border-brand" />
              ) : (
                <SmallSettingsTable
                  hasSettings={hasSettings}
                  settings={setting[0]?.settings as any}
                />
              )}
            </div>
          </div>
        </FormControl>
        <FormMessage />
      </FormItem>
    </>
  );
};

export default GameSettingsField;
