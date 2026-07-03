import React from "react";

export async function generateEvaluationPdfBlob(
  title: string,
  body: string
): Promise<Blob> {
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
          {body || "Sin contenido de informe."}
        </PdfText>
      </PdfPage>
    </Doc>
  );

  return pdfFn(doc).toBlob();
}

export function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._\-\u00C0-\u024F ]/g, "_").slice(0, 120);
}
