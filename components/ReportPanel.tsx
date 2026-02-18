"use client";

import { useRef, useEffect } from "react";
import { Document, Page, Text, View, StyleSheet, pdf } from "@react-pdf/renderer";

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 11, fontFamily: "Helvetica" },
  title: { fontSize: 16, marginBottom: 20, fontWeight: "bold" },
  body: { fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" },
});

export default function ReportPanel({
  title,
  body,
}: {
  title: string;
  body: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [body]);

  const handleExportPdf = () => {
    const doc = (
      <Document>
        <Page size="A4" style={styles.page}>
          <Text style={styles.title}>{title || "Informe de evaluación"}</Text>
          <Text style={styles.body}>{body || "El informe aparecerá aquí al ejecutar la evaluación."}</Text>
        </Page>
      </Document>
    );
    pdf(doc).toBlob().then((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "informe-evaluacion.pdf";
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  return (
    <div className="flex h-full flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-[#1e1e1e]">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {title || "TITULO DEL INFORME DE EVALUACIÓN"}
        </h2>
        <button
          type="button"
          onClick={handleExportPdf}
          className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:border-gray-600 dark:bg-[#374151] dark:text-gray-200 dark:hover:bg-[#4b5563]"
        >
          PDF
        </button>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-gray-800 dark:text-gray-200"
        style={{ whiteSpace: "pre-wrap" }}
      >
        {body || "Cuerpo del informe de evaluación. Ejecute \"Evaluar\" para generar el informe."}
      </div>
    </div>
  );
}
