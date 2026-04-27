import { CSSProperties } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface DescriptionMarkdownProps {
  children: string;
  className?: string;
  style?: CSSProperties;
  hrClassName?: string;
}

const DescriptionMarkdown = ({
  children,
  className,
  style,
  hrClassName,
}: DescriptionMarkdownProps) => (
  <div className={cn("markdown-content", className)} style={style}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        ...(hrClassName
          ? { hr: () => <hr className={hrClassName} /> }
          : {}),
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
      }}
    >
      {children}
    </ReactMarkdown>
  </div>
);

export default DescriptionMarkdown;
