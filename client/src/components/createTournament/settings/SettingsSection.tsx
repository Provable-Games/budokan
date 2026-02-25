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
import { useSettings } from "metagame-sdk/sql";
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

  const { settings: setting } = useSettings({
    gameAddresses: [form.watch("game")],
    settingsIds: [field.value],
  });

  const { totalCount: settingsCount } = useSettings({
    gameAddresses: [form.watch("game")],
    fetchCount: true,
  });

  const totalPages = Math.ceil((settingsCount ?? 0) / settingsPerPage);

  const { settings, loading: isLoadingSettings } = useSettings({
    gameAddresses: [form.watch("game")],
    limit: settingsPerPage,
    offset: (currentPage - 1) * settingsPerPage,
  });

  useEffect(() => {
    if (open) {
      setCurrentPage(1);
    }
  }, [open]);

  const hasSettings = !!setting[0]?.data;

  return (
    <>
      <SettingsDialog
        open={open}
        onOpenChange={setOpen}
        game={form.watch("game")}
        settings={settings}
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
                  settings={setting[0]?.data}
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
