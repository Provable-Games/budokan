interface LoadingPageProps {
  message: string;
}

const LoadingPage = ({ message }: LoadingPageProps) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-6 bg-black/20 backdrop-blur-sm z-50">
      <div className="relative w-16 h-16">
        <div className="absolute w-full h-full border-4 border-brand rounded-full animate-ping opacity-75"></div>
        <div className="absolute w-full h-full border-4 border-brand-muted rounded-full animate-pulse"></div>
      </div>
      {message && (
        <span className="font-brand text-2xl text-brand-muted animate-pulse">
          {message}
        </span>
      )}
    </div>
  );
};

export default LoadingPage;
