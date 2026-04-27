import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import useUIStore from "@/hooks/useUIStore";
import { GameSettings } from "@/lib/types";
import { QUESTION } from "@/components/Icons";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game: string;
  settings: GameSettings | undefined;
}

export const SettingsDialog = ({
  open,
  onOpenChange,
  game,
  settings,
}: SettingsDialogProps) => {
  const { getGameImage, getGameName } = useUIStore();

  const gameImage = getGameImage(game);
  const gameName = getGameName(game) ?? "Unknown";

  const entries: Array<[string, unknown]> = settings?.settings
    ? Object.entries(settings.settings as Record<string, unknown>)
    : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-black border border-brand p-4 sm:p-6 rounded-lg sm:max-w-xl">
        <DialogTitle className="font-brand text-lg sm:text-xl text-brand">
          Game Settings
        </DialogTitle>

        {/* Game identity */}
        <div className="flex flex-row items-center gap-3 border-b border-brand/15 pb-3">
          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full overflow-hidden bg-black/40 border border-brand/20 text-brand/40">
            {gameImage ? (
              <img
                src={gameImage}
                alt={gameName}
                width={40}
                height={40}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-2/3 h-2/3">
                <QUESTION />
              </span>
            )}
          </div>
          <div className="flex flex-col leading-none min-w-0">
            <span className="text-[10px] uppercase tracking-wider text-brand-muted">
              Game
            </span>
            <span className="font-brand text-base text-brand mt-0.5 truncate">
              {gameName}
            </span>
          </div>
        </div>

        {!settings ? (
          <div className="flex flex-col items-center justify-center gap-1 py-10">
            <span className="text-sm text-brand-muted/60 font-semibold">
              No settings available
            </span>
            <span className="text-xs text-brand-muted/40">
              Default configuration will be used
            </span>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-brand-muted">
                Configuration
              </span>
              <h4 className="font-brand text-base text-brand leading-none">
                {settings.name ?? `#${settings.settings_id}`}
              </h4>
              {settings.description && (
                <p className="text-xs text-brand-muted leading-relaxed mt-1">
                  {settings.description}
                </p>
              )}
            </div>

            {entries.length > 0 ? (
              <div className="flex flex-col border border-brand/10 rounded-md overflow-hidden bg-brand/[0.03]">
                <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-1.5 text-[10px] uppercase tracking-wider text-brand-muted/70 bg-brand/5 border-b border-brand/10">
                  <span>Parameter</span>
                  <span className="text-right">Value</span>
                </div>
                <div className="flex flex-col divide-y divide-brand/10 max-h-72 overflow-y-auto">
                  {entries.map(([key, value]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 text-xs"
                    >
                      <span className="text-brand-muted capitalize truncate">
                        {key.replace(/_/g, " ")}
                      </span>
                      <span className="font-mono text-neutral text-right break-all">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-brand-muted/60 italic py-3">
                This configuration has no additional parameters.
              </p>
            )}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
};
