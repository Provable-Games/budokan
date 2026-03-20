interface LoadingPageProps {
  message: string;
}

const LoadingPage = ({ message }: LoadingPageProps) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center gap-8 bg-[rgb(var(--color-background))]/80 backdrop-blur-md z-50">
      <div className="relative w-12 h-12">
        <div className="absolute w-full h-full border-2 border-brand/30 rounded-full"></div>
        <div className="absolute w-full h-full border-2 border-transparent border-t-brand rounded-full animate-spin"></div>
      </div>
      {message && (
        <span className="text-sm text-brand-muted font-medium tracking-wide">
          {message}
        </span>
      )}
    </div>
  );
};

export default LoadingPage;
