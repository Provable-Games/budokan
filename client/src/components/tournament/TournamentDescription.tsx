import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChevronDown } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TournamentDescriptionProps {
  tournamentName: string;
  description: string;
}

const TournamentDescription = ({
  tournamentName,
  description,
}: TournamentDescriptionProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);

  const hasDescription = description.trim().length > 0;
  const isLong = description.length > 300;

  return (
    <div className="flex flex-col gap-2">
      {hasDescription ? (
        <div className="relative">
          <div
            className="markdown-content prose prose-sm prose-invert max-w-none text-neutral/80 overflow-hidden"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 8,
              WebkitBoxOrient: "vertical",
            }}
          >
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                hr: () => (
                  <hr className="my-3 border-0 h-px bg-brand/20" />
                ),
              }}
            >
              {description}
            </ReactMarkdown>
          </div>
          {isLong && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => setDialogOpen(true)}
              className="absolute bottom-0 right-0 text-xs bg-black shadow-[-12px_0_12px_4px_rgba(0,0,0,0.85)]"
            >
              Read more
              <ChevronDown className="w-3 h-3 ml-0.5" />
            </Button>
          )}
        </div>
      ) : (
        <p className="text-sm text-brand-muted/70 italic">
          The creator has not provided a description for this tournament.
        </p>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-black border border-brand p-6 rounded-lg max-w-[90vw] sm:max-w-[80vw] md:max-w-[70vw] lg:max-w-[60vw] max-h-[90vh] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <h3 className="font-brand text-xl text-brand">{tournamentName}</h3>
            <div className="w-full h-0.5 bg-brand/25" />
            <div className="markdown-content prose prose-sm prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  hr: () => (
                    <hr className="my-4 border-0 h-px bg-brand/25" />
                  ),
                }}
              >
                {description}
              </ReactMarkdown>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TournamentDescription;
