import { Button } from "@/components/ui/button";
import { WEDGE_LEFT, WEDGE_RIGHT } from "@/components/Icons";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  nextPage: () => void;
  previousPage: () => void;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

const Pagination = ({
  currentPage,
  totalPages,
  nextPage,
  previousPage,
  hasNextPage,
  hasPreviousPage,
}: PaginationProps) => {
  return (
    <div className="flex flex-row gap-1 justify-center items-center">
      <Button
        size={"xs"}
        variant={"outline"}
        onClick={() => previousPage()}
        disabled={!hasPreviousPage}
        className="shrink-0"
      >
        <WEDGE_LEFT />
      </Button>

      {/* Simple page counter for all screen sizes */}
      <div className="flex items-center justify-center min-w-[50px] text-sm text-brand font-medium">
        {currentPage + 1} / {totalPages}
      </div>

      <Button
        size={"xs"}
        variant={"outline"}
        onClick={() => nextPage()}
        disabled={!hasNextPage}
        className="shrink-0"
      >
        <WEDGE_RIGHT />
      </Button>
    </div>
  );
};

export default Pagination;