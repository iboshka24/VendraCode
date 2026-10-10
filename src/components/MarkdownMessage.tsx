import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Renders agent/assistant output as real markdown — bold, lists, links, tables
 * and code blocks — instead of showing the raw `**`, backticks and `#`
 * characters in the chat. Styled with the app's design tokens.
 */
export function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="vc-md text-xs leading-relaxed break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="mb-1.5 last:mb-0 leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="leading-relaxed">{children}</li>,
          h1: ({ children }) => <h1 className="text-[13px] font-bold mb-1 mt-2 first:mt-0">{children}</h1>,
          h2: ({ children }) => <h2 className="text-[12.5px] font-bold mb-1 mt-2 first:mt-0">{children}</h2>,
          h3: ({ children }) => <h3 className="text-xs font-semibold mb-1 mt-1.5 first:mt-0">{children}</h3>,
          strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-2 my-1.5 text-text-secondary">{children}</blockquote>
          ),
          hr: () => <hr className="my-2 border-border" />,
          pre: ({ children }) => (
            <pre className="my-1.5 p-2 rounded-lg bg-bgside border border-border overflow-x-auto whitespace-pre">{children}</pre>
          ),
          code: ({ className, children }) => {
            const text = String(children ?? '');
            const isBlock = /language-/.test(className || '') || text.includes('\n');
            if (isBlock) {
              return <code className="font-mono text-[10.5px] leading-relaxed">{children}</code>;
            }
            return (
              <code className="px-1 py-0.5 rounded bg-chip border border-border font-mono text-[10.5px] whitespace-pre-wrap break-all">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-1.5">
              <table className="border-collapse text-[10.5px]">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border px-1.5 py-0.5 bg-chip font-semibold text-left">{children}</th>,
          td: ({ children }) => <td className="border border-border px-1.5 py-0.5">{children}</td>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
