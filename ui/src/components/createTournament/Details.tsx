import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StepProps } from "@/containers/CreateTournament";
import TokenGameIcon from "@/components/icons/TokenGameIcon";
import { Switch } from "@/components/ui/switch";
import SettingsSection from "@/components/createTournament/settings/SettingsSection";
import useUIStore from "@/hooks/useUIStore";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getPlayUrl } from "@/assets/games";

const Details = ({ form }: StepProps) => {
  const { gameData } = useUIStore();
  const [isMobileDialogOpen, setIsMobileDialogOpen] = useState(false);
  const [isMarkdownPreviewOpen, setIsMarkdownPreviewOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const subscription = form.watch((_value, { name }) => {
      if (name === "game") {
        form.setValue("settings", "0");
        // Prefill play_url with the game's playUrl if available
        const gameAddress = form.getValues("game");
        const playUrl = getPlayUrl(gameAddress);
        if (playUrl) {
          form.setValue("play_url", playUrl);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, [form]);

  return (
    <>
      <div className="flex flex-col lg:p-2 2xl:p-4 gap-2 sm:gap-5">
        <div className="flex flex-col">
          <span className="font-brand text-lg sm:text-xl lg:text-2xl 2xl:text-3xl 3xl:text-4xl font-bold">
            Details
          </span>
          <div className="w-full h-0.5 bg-brand/25" />
        </div>
        <div className="flex flex-col sm:flex-row gap-5 sm:px-4">
          <div className="flex flex-col gap-2 sm:gap-5 w-full sm:w-3/5">
            <FormField
              control={form.control}
              name="game"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-row items-center gap-5">
                    <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                      Game
                    </FormLabel>
                    <FormDescription className="sm:text-xs xl:text-sm 3xl:text-base">
                      Choose the game to be played
                    </FormDescription>
                  </div>
                  <FormControl>
                    <div className="flex flex-row gap-5 overflow-x-auto pb-2">
                      {gameData.map((game) => (
                        <Card
                          key={game.contract_address}
                          variant={
                            field.value === game.contract_address
                              ? "default"
                              : "outline"
                          }
                          className={`flex flex-col justify-between sm:h-[100px] 3xl:h-[120px] w-[100px] 3xl:w-[120px] flex-shrink-0 p-2 hover:cursor-pointer ${
                            field.value === game.contract_address &&
                            "bg-brand-muted"
                          }`}
                          onClick={() => field.onChange(game.contract_address)}
                          disabled={!game.existsInMetadata}
                        >
                          <TokenGameIcon size="md" image={game.image} />
                          <Tooltip delayDuration={50}>
                            <TooltipTrigger asChild>
                              <p className="font-brand text-center truncate w-full 3xl:text-lg">
                                {game.name}
                              </p>
                            </TooltipTrigger>
                            <TooltipContent className="border-brand bg-black text-neutral 3xl:text-lg">
                              {game.name}
                            </TooltipContent>
                          </Tooltip>
                        </Card>
                      ))}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="w-full h-0.5 bg-brand/25" />
            <FormField
              control={form.control}
              name="settings"
              render={({ field }) => (
                <SettingsSection form={form} field={field} />
              )}
            />
          </div>
          <div className="w-full h-px bg-brand sm:hidden" />
          <div className="hidden sm:block w-px bg-brand" />
          <div className="flex flex-col gap-5 w-full sm:w-2/5">
            <FormField
              control={form.control}
              name="name"
              render={({ field: { value, onChange, ...fieldProps } }) => (
                <FormItem>
                  <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                    Name
                  </FormLabel>
                  <FormControl>
                    <Input
                      className="h-10 text-sm sm:text-base"
                      placeholder="Tournament name"
                      {...fieldProps}
                      value={typeof value === "string" ? value : ""}
                      onChange={(e) => onChange(e.target.value)}
                      maxLength={31}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <div className="flex flex-row items-center justify-between">
                    <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
                      Description
                    </FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsMarkdownPreviewOpen(true)}
                      className="text-xs"
                      disabled={!field.value || field.value.trim() === ""}
                    >
                      Preview
                    </Button>
                  </div>
                  <FormControl>
                    <Textarea
                      className="min-h-[50px] text-sm sm:text-base"
                      placeholder="Tournament description (Markdown supported)"
                      {...field}
                    />
                  </FormControl>
                  <div className="flex flex-row items-center justify-between">
                    <FormDescription className="text-xs">
                      Markdown formatting is supported
                    </FormDescription>
                    <span
                      onClick={() => setShowAdvanced(!showAdvanced)}
                      className="text-xs text-brand hover:text-brand/80 cursor-pointer"
                    >
                      {showAdvanced ? "Hide Advanced" : "Show Advanced"}
                    </span>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            {showAdvanced && (
              <>
                <div className="w-full h-0.5 bg-brand/25" />
                <FormField
                  control={form.control}
                  name="soulbound"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex flex-row items-center justify-between gap-2">
                        <div className="flex flex-row items-center gap-3">
                          <FormLabel className="font-brand text-sm sm:text-base">
                            Soulbound
                          </FormLabel>
                          <FormDescription className="hidden sm:block text-xs">
                            Entry tokens cannot be transferred
                          </FormDescription>
                        </div>
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                          />
                        </FormControl>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="play_url"
                  render={({ field: { value, onChange, ...fieldProps } }) => (
                    <FormItem>
                      <div className="flex flex-row items-center gap-3">
                        <FormLabel className="font-brand text-sm sm:text-base">
                          Play URL
                        </FormLabel>
                        <FormDescription className="hidden sm:block text-xs">
                          Custom URL (optional)
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Input
                          className="h-8 text-xs sm:text-sm"
                          placeholder="https://example.com/play"
                          {...fieldProps}
                          value={typeof value === "string" ? value : ""}
                          onChange={(e) => onChange(e.target.value)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
        </div>
      </div>
      <Dialog open={isMobileDialogOpen} onOpenChange={setIsMobileDialogOpen}>
        <DialogContent className="sm:hidden bg-black border border-brand p-4 rounded-lg max-w-[90vw] mx-auto">
          <div className="flex flex-col gap-4 justify-between items-center mb-4">
            <h3 className="font-brand text-lg text-brand">Leaderboard Size</h3>
            <p className="text-muted-foreground">
              Determines how many players are scored.
            </p>
            <p className="text-neutral text-wrap text-sm text-center">
              The size of the leaderboard governs how many players can recieve
              entry fees and prizes as well as who can qualify for further
              tournaments.
            </p>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={isMarkdownPreviewOpen}
        onOpenChange={setIsMarkdownPreviewOpen}
      >
        <DialogContent className="bg-black border border-brand p-6 rounded-lg max-w-[90vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h3 className="font-brand text-xl text-brand">
              Description Preview
            </h3>
            <div className="w-full h-0.5 bg-brand/25" />
            <div className="markdown-content">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {form.watch("description") || ""}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Details;
