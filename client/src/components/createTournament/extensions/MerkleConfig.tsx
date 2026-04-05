import { useState, useEffect } from "react";
import { useFormContext } from "react-hook-form";
import {
  FormControl,
  FormItem,
  FormLabel,
  FormDescription,
  FormMessage,
} from "@/components/ui/form";
import { useChainConfig } from "@/context/chain";
import { getExtensionAddresses } from "@provable-games/metagame-sdk";
import type { MerkleTree } from "@provable-games/metagame-sdk/merkle";
import { useMerkleTrees } from "@provable-games/metagame-sdk/react";
import Pagination from "@/components/table/Pagination";
import { ExternalLink } from "lucide-react";

const MERKLE_CREATE_URL = "https://localhost:5174/merkle";
const PAGE_SIZE = 10;

interface MerkleConfigProps {
  extensionError?: string;
}

export const MerkleConfig = ({ extensionError }: MerkleConfigProps) => {
  const { selectedChainConfig } = useChainConfig();
  const form = useFormContext();

  const [selectedTreeId, setSelectedTreeId] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState(1);

  const { trees, totalPages, isLoading } = useMerkleTrees({
    page: currentPage,
    limit: PAGE_SIZE,
  });

  // Restore selection from form on mount
  useEffect(() => {
    const config = form.watch("gatingOptions.extension.config");
    if (config) {
      setSelectedTreeId(Number(config));
    }
  }, []);

  const selectTree = (tree: MerkleTree) => {
    setSelectedTreeId(tree.id);
    form.setValue("gatingOptions.extension.config", String(tree.id));

    const extensionAddresses = getExtensionAddresses(
      selectedChainConfig?.chainId ?? ""
    );
    if (extensionAddresses.merkleValidator) {
      form.setValue(
        "gatingOptions.extension.address",
        extensionAddresses.merkleValidator
      );
    }
  };

  return (
    <FormItem>
      <div className="flex flex-row items-center justify-between">
        <div className="flex flex-row items-center gap-5">
          <FormLabel className="font-brand text-lg xl:text-xl 2xl:text-2xl 3xl:text-3xl">
            Allowlist
          </FormLabel>
          <FormDescription className="hidden sm:block">
            Select a merkle allowlist for entry validation
          </FormDescription>
        </div>
        <div className="flex flex-row items-center gap-2">
          {extensionError && (
            <span className="text-red-500 text-sm">{extensionError}</span>
          )}
          <a
            href={MERKLE_CREATE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand hover:text-brand/80 transition-colors"
          >
            Create Allowlist
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
      <FormControl>
        <div className="flex flex-col gap-2">
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Loading allowlists...
            </div>
          ) : trees.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              No allowlists available
            </div>
          ) : (
            <>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {trees.map((tree) => (
                  <button
                    key={tree.id}
                    type="button"
                    onClick={() => selectTree(tree)}
                    className={`flex flex-col gap-1 p-3 rounded-md border text-left transition-colors ${
                      selectedTreeId === tree.id
                        ? "border-brand bg-brand/10"
                        : "border-border hover:border-brand/50"
                    }`}
                  >
                    <div className="flex flex-row items-center justify-between">
                      <span className="font-medium text-sm">
                        {tree.name || `Tree ${tree.id}`}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {tree.entryCount} {tree.entryCount === 1 ? "address" : "addresses"}
                      </span>
                    </div>
                    {tree.description && (
                      <span className="text-xs text-muted-foreground">
                        {tree.description}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  nextPage={() => setCurrentPage(currentPage + 1)}
                  previousPage={() => setCurrentPage(currentPage - 1)}
                  hasNextPage={currentPage < totalPages}
                  hasPreviousPage={currentPage > 1}
                />
              )}
            </>
          )}
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
};
