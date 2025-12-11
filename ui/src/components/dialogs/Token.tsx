import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { getTokenLogoUrl } from "@/lib/tokensMeta";
import { useDojo } from "@/context/dojo";
import { QUESTION } from "@/components/Icons";
import { indexAddress } from "@/lib/utils";
import { FormToken } from "@/lib/types";
import { mainnetNFTs } from "@/lib/nfts";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { getPaginatedTokens, TokenForDisplay } from "@/lib/tokenUtils";

interface TokenDialogProps {
  selectedToken: FormToken | undefined;
  onSelect: (token: FormToken) => void;
  type?: "erc20" | "erc721";
}

const TokenDialog = ({ selectedToken, onSelect, type }: TokenDialogProps) => {
  const [tokenSearchQuery, setTokenSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const { selectedChainConfig } = useDojo();

  const tokensPerPage = 10;
  const offset = currentPage * tokensPerPage;

  // Debounce search query to avoid too many requests
  const debouncedSearch = useDebounce(tokenSearchQuery, 300);

  // Use static token data
  const { tokens: paginatedTokens, total: totalTokensCount } = useMemo(() => {
    return getPaginatedTokens(selectedChainConfig?.chainId ?? "", {
      tokenType: type,
      search: debouncedSearch,
      limit: tokensPerPage,
      offset,
    });
  }, [selectedChainConfig, debouncedSearch, type, offset, tokensPerPage]);

  const newTokensLoading = false; // No loading needed for static data

  // Tokens are already filtered and paginated by getPaginatedTokens
  const displayTokens = paginatedTokens;

  const erc721Tokens = displayTokens.filter(
    (token) => token.token_type === "erc721"
  );

  const whitelistedNFTTokens = mainnetNFTs.filter((nft) =>
    erc721Tokens.some(
      (token) => indexAddress(nft.address) === indexAddress(token.token_address)
    )
  );

  const getTokenImage = (token: TokenForDisplay) => {
    if (token.token_type === "erc20") {
      return getTokenLogoUrl(selectedChainConfig?.chainId ?? "", token.token_address);
    } else {
      const whitelistedImage = whitelistedNFTTokens.find(
        (nft) => indexAddress(nft.address) === indexAddress(token.token_address)
      )?.image;
      if (whitelistedImage) {
        return whitelistedImage;
      }
      return null;
    }
  };

  // Reset page when search changes
  const handleSearchChange = (value: string) => {
    setTokenSearchQuery(value);
    setCurrentPage(0);
  };

  // Handle dialog open/close
  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset state when closing
      setCurrentPage(0);
      setTokenSearchQuery("");
    }
  };

  const hasMoreTokens = totalTokensCount
    ? (currentPage + 1) * tokensPerPage < totalTokensCount
    : false;

  const totalPages = Math.ceil((totalTokensCount || 0) / tokensPerPage);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant={selectedToken ? "default" : "outline"}
          type="button"
          size="sm"
          className="h-10 w-[160px]"
        >
          {selectedToken ? (
            <div className="flex items-center gap-2 overflow-hidden w-full">
              <img
                src={selectedToken.image ?? undefined}
                className="w-4 h-4 flex-shrink-0"
                alt="Token logo"
              />
              <span className="text-sm uppercase truncate">
                {selectedToken.symbol}
              </span>
            </div>
          ) : (
            "Select Token"
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="h-[600px] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="p-4">Select Token</DialogTitle>
          <div className="px-4 pb-4">
            <div className="flex items-center border rounded border-brand-muted bg-background">
              <Search className="w-4 h-4 ml-3 text-muted-foreground" />
              <Input
                placeholder="Search tokens..."
                value={tokenSearchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>
        </DialogHeader>
        <div className="flex-1 flex flex-col min-h-0">
          {newTokensLoading ? (
            <div className="flex-1 overflow-y-auto">
              {Array.from({ length: 10 }).map((_, index) => (
                <div
                  key={index}
                  className="w-full flex flex-row items-center justify-between px-5 py-2"
                >
                  <div className="flex flex-row gap-5 items-center">
                    <Skeleton className="w-8 h-8 rounded-full" />
                    <div className="flex flex-col gap-1">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                  </div>
                  <Skeleton className="h-4 w-12" />
                </div>
              ))}
            </div>
          ) : displayTokens.length > 0 ? (
            <div className="flex-1 overflow-y-auto">
              {displayTokens.map((token, index) => {
                const tokenLogo = getTokenImage(token);
                return (
                  <DialogClose asChild key={index}>
                    <div
                      className={`w-full flex flex-row items-center justify-between hover:bg-brand/20 hover:cursor-pointer px-5 py-2 ${
                        selectedToken?.address === token.token_address
                          ? "bg-terminal-green/75 text-terminal-black"
                          : ""
                      }`}
                      onClick={() =>
                        onSelect({
                          address: token.token_address,
                          name: token.name,
                          symbol: token.symbol,
                          token_type: token.token_type,
                          image: getTokenImage(token) ?? undefined,
                        })
                      }
                    >
                      <div className="flex flex-row gap-5 items-center">
                        {tokenLogo ? (
                          <img
                            src={tokenLogo}
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 ">
                            <QUESTION />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-bold">{token.name}</span>
                          <span className="uppercase text-neutral">
                            {token.symbol}
                          </span>
                        </div>
                      </div>
                      <span className="uppercase text-neutral">
                        {token.token_type}
                      </span>
                    </div>
                  </DialogClose>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center h-full justify-center">
                <span className="text-neutral">
                  No <span className="uppercase">{type && type}</span> tokens
                  found
                </span>
              </div>
            </div>
          )}

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-brand/20">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                disabled={currentPage === 0}
                className="flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>

              <div className="flex flex-col items-center gap-1">
                <span className="text-sm text-muted-foreground">
                  Page {currentPage + 1} of {totalPages}
                </span>
                {totalTokensCount !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {totalTokensCount} tokens found
                  </span>
                )}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => p + 1)}
                disabled={!hasMoreTokens}
                className="flex items-center gap-1"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TokenDialog;
