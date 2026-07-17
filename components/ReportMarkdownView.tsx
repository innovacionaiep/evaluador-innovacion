"use client";

import {
  parseReportMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
} from "@/lib/report-markdown-pdf";

function renderInlines(inlines: MarkdownInline[]) {
  return inlines.map((part, i) =>
    part.bold ? (
      <strong key={i} className="font-semibold text-gray-900 dark:text-gray-50">
        {part.text}
      </strong>
    ) : (
      <span key={i}>{part.text}</span>
    )
  );
}

function ReportBlock({ block }: { block: MarkdownBlock }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 className="mt-5 mb-2 border-b border-gray-200 pb-1 text-base font-bold text-gray-900 dark:border-gray-600 dark:text-gray-50">
          {renderInlines(block.inlines)}
        </h2>
      );
    case "h3":
      return (
        <h3 className="mt-4 mb-1.5 text-sm font-semibold text-gray-800 dark:text-gray-100">
          {renderInlines(block.inlines)}
        </h3>
      );
    case "hr":
      return <hr className="my-4 border-gray-200 dark:border-gray-600" />;
    case "blank":
      return <div className="h-2" aria-hidden />;
    case "paragraph":
      return (
        <p className="mb-2 text-sm leading-relaxed text-gray-800 dark:text-gray-200">
          {renderInlines(block.inlines)}
        </p>
      );
    case "table":
      return (
        <div className="my-3 overflow-x-auto rounded border border-gray-200 dark:border-gray-600">
          <table className="w-full min-w-[280px] border-collapse text-left text-sm">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                {block.headers.map((header, i) => (
                  <th
                    key={i}
                    className="border-b border-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 dark:border-gray-600 dark:text-gray-100"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr
                  key={ri}
                  className="odd:bg-white even:bg-gray-50 dark:odd:bg-transparent dark:even:bg-white/5"
                >
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="border-b border-gray-100 px-3 py-1.5 text-gray-800 dark:border-gray-700 dark:text-gray-200"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

/** Renderiza el markdown de informes (##, ###, **, ---, tablas) en HTML. */
export default function ReportMarkdownView({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  const blocks = parseReportMarkdown(content || "");
  if (blocks.length === 0) {
    return (
      <p className={`text-sm text-gray-500 dark:text-gray-400 ${className}`}>
        (Sin contenido)
      </p>
    );
  }
  return (
    <div className={`report-markdown ${className}`}>
      {blocks.map((block, i) => (
        <ReportBlock key={i} block={block} />
      ))}
    </div>
  );
}
