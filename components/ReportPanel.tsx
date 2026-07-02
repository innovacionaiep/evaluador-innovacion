"use client";

import { useState, useRef, useEffect } from "react";

const ExpandIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
  </svg>
);

export default function ReportPanel({
  title,
  body,
  onFullscreenRequest,
}: {
  title: string;
  body: string;
  onFullscreenRequest?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [body]);

  const handleExportPdf = async () => {
    const { Document: Doc, Page: PdfPage, Text: PdfText, StyleSheet: SS, pdf: pdfFn } =
      await import("@react-pdf/renderer");
    const pdfStyles = SS.create({
      page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
      title: { fontSize: 16, marginBottom: 20, fontWeight: "bold" },
      body: { fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" },
    });
    const doc = (
      <Doc>
        <PdfPage size="A4" style={pdfStyles.page}>
          <PdfText style={pdfStyles.title}>{title || "Informe de evaluación"}</PdfText>
          <PdfText style={pdfStyles.body}>
            {body || "El informe aparecerá aquí al ejecutar la evaluación."}
          </PdfText>
        </PdfPage>
      </Doc>
    );
    const blob = await pdfFn(doc).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "informe-evaluacion.pdf";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e]">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          <span className="shrink-0 text-gray-500 dark:text-gray-400" aria-hidden>
            {expanded ? "▼" : "▶"}
          </span>
          <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
            {title || "TITULO DEL INFORME DE EVALUACIÓN"}
          </h2>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          {onFullscreenRequest && (
            <button
              type="button"
              onClick={onFullscreenRequest}
              className="rounded p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
              title="Pantalla completa"
              aria-label="Ver informe en pantalla completa"
            >
              <ExpandIcon />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            className="rounded px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Exportar PDF
          </button>
        </div>
      </div>
      {expanded && (
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-800 dark:text-gray-200"
          style={{ whiteSpace: "pre-wrap" }}
        >
          {body || "Cuerpo del informe de evaluación. Ejecute \"Evaluar\" para generar el informe."}
        </div>
      )}
    </div>
  );
}
