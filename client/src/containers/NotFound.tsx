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
    <div className="w-3/4 mx-auto flex flex-col gap-5">
      <div className="flex flex-row justify-between">
        <Button variant="outline" onClick={() => navigate("/")}>
          <ARROW_LEFT />
          Back
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2">
        <span className="font-brand text-3xl text-retro-red">
          Oops! {message}
        </span>
        <p className="text-brand-muted">
          The page you're looking for doesn't exist or has been removed.
        </p>
      </div>
    </div>
  );
};

export default NotFound;
