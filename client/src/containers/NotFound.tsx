import React from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { ARROW_LEFT } from "../components/Icons";

interface NotFoundProps {
  message?: string;
}

const NotFound: React.FC<NotFoundProps> = ({ message = "Page not found" }) => {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto flex flex-col gap-8 pt-20">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="text-6xl font-brand tracking-tighter text-brand/20">
          404
        </span>
        <span className="text-lg font-medium text-brand">
          {message}
        </span>
        <p className="text-sm text-brand-muted max-w-[45ch]">
          The page you're looking for doesn't exist or has been removed.
        </p>
        <Button variant="outline" onClick={() => navigate("/")} className="mt-2">
          <ARROW_LEFT />
          Back to tournaments
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
