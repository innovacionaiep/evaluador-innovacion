"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";
import ReportPanel from "@/components/ReportPanel";
import ConfigPanel from "@/components/ConfigPanel";
import FullscreenOverlay, { ExpandIcon } from "@/components/FullscreenOverlay";
import type { ChatMessage } from "@/components/ChatPanel";
import type { ProjectStructuredData } from "@/lib/build-context";

type EvaluationType = { id: number; name: string };

const SESSION_ID = "default";

/** Parsea líneas "Elemento | Contenido" (o "Elemento|Contenido") y devuelve filas, sin repetir elemento (primera aparición). */
function parseElementoContenido(text: string): [string, string][] {
  const rows: [string, string][] = [];
  const seen = new Set<string>();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    let t = line.trim().replace(/^\|/, "").trim();
    const sep = t.includes(" | ") ? " | " : "|";
    const idx = t.indexOf(sep);
    if (idx >= 0) {
      const elemento = t.slice(0, idx).trim();
      const contenido = t.slice(idx + sep.length).trim().replace(/\|+$/, "").trim();
      if (!elemento) continue;
      const key = elemento.toLowerCase();
      if (seen.has(key)) continue;
      if (key === "elemento" && contenido.toLowerCase() === "contenido") continue;
      seen.add(key);
      rows.push([elemento, contenido || "—"]);
    }
  }
  return rows;
}

export default function Home() {
  const [evaluationTypes, setEvaluationTypes] = useState<EvaluationType[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reportContent, setReportContent] = useState("");
  const [reportTitle, setReportTitle] = useState("TITULO DEL INFORME DE EVALUACIÓN");
  const [projectFilePaths, setProjectFilePaths] = useState<string[]>([]);
  const [extractedProjectText, setExtractedProjectText] = useState("");
  const [extractedProjectTable, setExtractedProjectTable] = useState<{ section?: string; element: string; content: string }[]>([]);
  const [extractedStructuredData, setExtractedStructuredData] = useState<ProjectStructuredData | null>(null);
  const [extractedProjectLoading, setExtractedProjectLoading] = useState(false);
  const [elementsWithSection, setElementsWithSection] = useState<{ title: string; section: string }[]>([]);
  const [projectSectionOpen, setProjectSectionOpen] = useState(true);
  const [fullscreenSection, setFullscreenSection] = useState<"project" | "report" | null>(null);

  useEffect(() => {
    fetch("/api/evaluation-types")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setEvaluationTypes(data);
          if (data.length > 0 && !activeTypeId) setActiveTypeId(data[0].id);
        }
      })
      .catch(() => {});
  }, [configOpen]);

  useEffect(() => {
    const t = evaluationTypes.find((x) => x.id === activeTypeId);
    setReportTitle(t ? `Informe: ${t.name}` : "TITULO DEL INFORME DE EVALUACIÓN");
  }, [activeTypeId, evaluationTypes]);

  useEffect(() => {
    if (!activeTypeId) {
      setElementsWithSection([]);
      return;
    }
    fetch(`/api/config/${activeTypeId}`)
      .then((r) => r.json())
      .then((data) => {
        const elements = Array.isArray(data.elements) ? data.elements : [];
        const mapped = elements
          .filter((e: unknown) => typeof e === "object" && e != null && "title" in e)
          .map((e: { title?: string; section?: string }) => ({
            title: String((e as { title: string }).title ?? "").trim(),
            section: typeof (e as { section?: string }).section === "string" ? ((e as { section: string }).section ?? "General").trim() : "General",
          }))
          .filter((e) => e.title);
        setElementsWithSection(mapped);
      })
      .catch(() => setElementsWithSection([]));
  }, [activeTypeId]);

  const MAX_EXTRACT_RETRIES = 5;
  const EXTRACT_RETRY_DELAY_MS = 3000;

  useEffect(() => {
    if (projectFilePaths.length === 0) {
      setExtractedProjectText("");
      setExtractedProjectTable([]);
      setExtractedStructuredData(null);
      setExtractedProjectLoading(false);
      return;
    }

    let cancelled = false;
    let currentController: AbortController | null = null;

    const doFetch = (attempt: number) => {
      if (cancelled) return;
      currentController = new AbortController();
      fetch("/api/project-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectFilePaths,
          evaluationTypeId: activeTypeId ?? undefined,
          stream: true,
        }),
        signal: currentController.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data?.error || res.statusText);
          }
          const reader = res.body?.getReader();
          if (!reader) throw new Error("No response body");
          const decoder = new TextDecoder();
          let buffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const data = JSON.parse(trimmed) as {
                  type: string;
                  message?: string;
                  name?: string;
                  text?: string;
                  error?: string;
                  elementsTable?: { element: string; content: string }[];
                  structuredData?: ProjectStructuredData;
                };
                if (data.type === "step" && typeof data.message === "string") {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant") next[next.length - 1] = { ...last, content: data.message! };
                    else next.push({ role: "assistant", content: data.message! });
                    return next;
                  });
                } else if (data.type === "element" && typeof data.name === "string") {
                  setMessages((prev) => {
                    const next = [...prev];
                    const last = next[next.length - 1];
                    if (last?.role === "assistant" && (last.content.endsWith("…") || last.content.includes("Identificando"))) {
                      const sep = last.content.endsWith("…") ? "\n\n" : "\n";
                      next[next.length - 1] = { ...last, content: last.content + sep + data.name + " ✓" };
                    }
                    return next;
                  });
                } else if (data.type === "done") {
                  const text = typeof data.text === "string" ? data.text : "";
                  const table = Array.isArray(data.elementsTable)
                    ? (data.elementsTable as { section?: string; element: string; content: string }[]).map((r) => ({
                        section: r.section,
                        element: r.element,
                        content: r.content,
                      }))
                    : [];
                  const sd = data.structuredData;
                  setExtractedProjectText(text);
                  setExtractedProjectTable(table);
                  setExtractedStructuredData(sd?.files?.length ? sd : null);
                  setMessages((prev) => [...prev, { role: "assistant", content: "Extracción completada." }]);
                  setExtractedProjectLoading(false);
                } else if (data.type === "error" && data.error) {
                  throw new Error(data.error);
                }
              } catch (e) {
                if (e instanceof SyntaxError) continue;
                throw e;
              }
            }
          }
          if (buffer.trim()) {
            try {
              const data = JSON.parse(buffer.trim()) as {
                type: string;
                text?: string;
                error?: string;
                elementsTable?: { element: string; content: string }[];
                structuredData?: ProjectStructuredData;
              };
              if (data.type === "done") {
                setExtractedProjectText(typeof data.text === "string" ? data.text : "");
                const table = Array.isArray(data.elementsTable)
                  ? (data.elementsTable as { section?: string; element: string; content: string }[]).map((r) => ({
                      section: r.section,
                      element: r.element,
                      content: r.content,
                    }))
                  : [];
                const sd = data.structuredData;
                setExtractedProjectTable(table);
                setExtractedStructuredData(sd?.files?.length ? sd : null);
                setMessages((prev) => [...prev, { role: "assistant", content: "Extracción completada." }]);
                setExtractedProjectLoading(false);
              }
              if (data.type === "error" && data.error) throw new Error(data.error);
            } catch (e) {
              if (!(e instanceof SyntaxError)) throw e;
            }
          }
        })
        .catch((err) => {
          setExtractedProjectText("");
          setExtractedProjectTable([]);
          setExtractedStructuredData(null);
          const msg = err?.message?.includes("429")
            ? "Extracción fallida: límite de uso temporal. Reintente en unos momentos."
            : "Extracción fallida.";
          setMessages((prev) => [...prev, { role: "assistant", content: msg }]);
          if (
            attempt < MAX_EXTRACT_RETRIES - 1 &&
            err?.message?.includes("429") &&
            !cancelled
          ) {
            setTimeout(() => {
              if (cancelled) return;
              setMessages((prev) => [
                ...prev,
                { role: "assistant", content: `Reintentando extracción (intento ${attempt + 2}/${MAX_EXTRACT_RETRIES})…` },
              ]);
              doFetch(attempt + 1);
            }, EXTRACT_RETRY_DELAY_MS);
          } else {
            setExtractedProjectLoading(false);
          }
        });
    };

    setExtractedProjectLoading(true);
    setMessages((prev) => [...prev, { role: "assistant", content: "Extrayendo información…" }]);
    setMessages((prev) => [...prev, { role: "assistant", content: "Detectando y organizando…" }]);
    doFetch(0);

    return () => {
      cancelled = true;
      currentController?.abort();
    };
  }, [projectFilePaths, activeTypeId]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-100 dark:bg-[#1e1e1e]">
      <Header
        types={evaluationTypes}
        activeId={activeTypeId}
        onSelect={setActiveTypeId}
        onOpenConfig={() => setConfigOpen(true)}
      />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col border-r border-gray-200 dark:border-gray-700">
          <ChatPanel
            messages={messages}
            onMessagesChange={setMessages}
            reportContent={reportContent}
            onReportContentChange={setReportContent}
            activeTypeId={activeTypeId}
            projectFilePaths={projectFilePaths}
            onProjectFilePathsChange={setProjectFilePaths}
            projectElementsTable={extractedProjectTable}
            projectStructuredData={extractedStructuredData ?? undefined}
            sessionId={SESSION_ID}
            extractionLoading={extractedProjectLoading}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col">
            <div
              className={`flex flex-col border-b border-gray-200 dark:border-gray-700 ${projectSectionOpen ? "min-h-0 flex-1" : "shrink-0"}`}
            >
              <div className="flex shrink-0 w-full items-center gap-2 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setProjectSectionOpen((o) => !o)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-lg font-semibold text-gray-900 hover:bg-gray-50 focus:outline-none focus:ring-1 focus:ring-gray-300 dark:text-gray-100 dark:hover:bg-gray-800 dark:focus:ring-gray-600"
                >
                  <span className="text-gray-500 dark:text-gray-400" aria-hidden>
                    {projectSectionOpen ? "▼" : "▶"}
                  </span>
                  Proyecto extraído
                </button>
                <button
                  type="button"
                  onClick={() => setFullscreenSection("project")}
                  className="shrink-0 rounded p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  title="Pantalla completa"
                  aria-label="Ver en pantalla completa"
                >
                  <ExpandIcon />
                </button>
              </div>
              {projectSectionOpen && (
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 text-sm text-gray-800 dark:text-gray-200">
                  {extractedProjectLoading
                    ? "Extrayendo con IA…"
                    : (() => {
                        const getSectionForElement = (elementName: string) => {
                          const found = elementsWithSection.find((e) => e.title === elementName.trim());
                          return found?.section ?? "—";
                        };
                        const rawRows: { section: string; element: string; content: string }[] =
                          extractedProjectTable.length > 0
                            ? extractedProjectTable.map((r) => ({
                                section: r.section ?? getSectionForElement(r.element),
                                element: r.element,
                                content: r.content,
                              }))
                            : parseElementoContenido(extractedProjectText?.trim() || "").map(([elem, cont]) => ({
                                section: getSectionForElement(elem),
                                element: elem,
                                content: cont,
                              }));
                        // Ordenar por sección (orden de primera aparición) y luego por elemento dentro de cada sección (como en Config)
                        const sectionOrder: string[] = [];
                        for (const e of elementsWithSection) {
                          if (!sectionOrder.includes(e.section)) sectionOrder.push(e.section);
                        }
                        const titleOrder: string[] = [];
                        for (const sec of sectionOrder) {
                          for (const e of elementsWithSection) {
                            if (e.section === sec) titleOrder.push(e.title);
                          }
                        }
                        const rowsOrdered: { section: string; element: string; content: string }[] = [];
                        for (const title of titleOrder) {
                          const row = rawRows.find((r) => r.element.trim() === title);
                          if (row) rowsOrdered.push(row);
                        }
                        const used = new Set(rowsOrdered.map((r) => r.element));
                        for (const row of rawRows) {
                          if (!used.has(row.element)) rowsOrdered.push(row);
                        }
                        const rowsWithSection = rowsOrdered;
                        if (rowsWithSection.length === 0) {
                          const t = extractedProjectText?.trim() || "";
                          if (!t) return "Sube archivos del proyecto para ver aquí el texto extraído.";
                          return <pre className="whitespace-pre-wrap font-sans">{t}</pre>;
                        }
                        return (
                          <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                            <thead>
                              <tr className="bg-gray-100 dark:bg-gray-800">
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Sección</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Elemento</th>
                                <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Contenido</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rowsWithSection.map((row, i) => (
                                <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                                  <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600">{row.section}</td>
                                  <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600">{row.element}</td>
                                  <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600 whitespace-pre-wrap">{row.content}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        );
                      })()}
                </div>
              )}
            </div>
            <div className="min-h-0 flex-1 flex flex-col">
              <ReportPanel
              title={reportTitle}
              body={reportContent}
              onFullscreenRequest={() => setFullscreenSection("report")}
            />
            </div>
          </div>
        </div>
      </div>
      <ConfigPanel
        isOpen={configOpen}
        onClose={() => setConfigOpen(false)}
        types={evaluationTypes}
        activeId={activeTypeId}
        onTypesChange={() => fetch("/api/evaluation-types").then((r) => r.json()).then(setEvaluationTypes)}
        onSelectType={setActiveTypeId}
      />
      {fullscreenSection === "project" && (
        <FullscreenOverlay title="Proyecto extraído" onClose={() => setFullscreenSection(null)}>
          <div className="text-sm text-gray-800 dark:text-gray-200">
            {extractedProjectLoading
              ? "Extrayendo con IA…"
              : (() => {
                  const getSectionForElement = (elementName: string) => {
                    const found = elementsWithSection.find((e) => e.title === elementName.trim());
                    return found?.section ?? "—";
                  };
                  const rawRows: { section: string; element: string; content: string }[] =
                    extractedProjectTable.length > 0
                      ? extractedProjectTable.map((r) => ({
                          section: r.section ?? getSectionForElement(r.element),
                          element: r.element,
                          content: r.content,
                        }))
                      : parseElementoContenido(extractedProjectText?.trim() || "").map(([elem, cont]) => ({
                          section: getSectionForElement(elem),
                          element: elem,
                          content: cont,
                        }));
                  const sectionOrder: string[] = [];
                  for (const e of elementsWithSection) {
                    if (!sectionOrder.includes(e.section)) sectionOrder.push(e.section);
                  }
                  const titleOrder: string[] = [];
                  for (const sec of sectionOrder) {
                    for (const e of elementsWithSection) {
                      if (e.section === sec) titleOrder.push(e.title);
                    }
                  }
                  const rowsOrdered: { section: string; element: string; content: string }[] = [];
                  for (const title of titleOrder) {
                    const row = rawRows.find((r) => r.element.trim() === title);
                    if (row) rowsOrdered.push(row);
                  }
                  const used = new Set(rowsOrdered.map((r) => r.element));
                  for (const row of rawRows) {
                    if (!used.has(row.element)) rowsOrdered.push(row);
                  }
                  const rowsWithSection = rowsOrdered;
                  if (rowsWithSection.length === 0) {
                    const t = extractedProjectText?.trim() || "";
                    if (!t) return "Sube archivos del proyecto para ver aquí el texto extraído.";
                    return <pre className="whitespace-pre-wrap font-sans">{t}</pre>;
                  }
                  return (
                    <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
                      <thead>
                        <tr className="bg-gray-100 dark:bg-gray-800">
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Sección</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Elemento</th>
                          <th className="border border-gray-300 px-3 py-2 text-left font-semibold dark:border-gray-600">Contenido</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowsWithSection.map((row, i) => (
                          <tr key={i} className="border-b border-gray-200 dark:border-gray-700">
                            <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600">{row.section}</td>
                            <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600">{row.element}</td>
                            <td className="border border-gray-300 px-3 py-2 align-top dark:border-gray-600 whitespace-pre-wrap">{row.content}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
          </div>
        </FullscreenOverlay>
      )}
      {fullscreenSection === "report" && (
        <FullscreenOverlay title={reportTitle} onClose={() => setFullscreenSection(null)}>
          <div className="text-gray-800 dark:text-gray-200" style={{ whiteSpace: "pre-wrap" }}>
            {reportContent || "Cuerpo del informe de evaluación. Ejecute \"Evaluar\" para generar el informe."}
          </div>
        </FullscreenOverlay>
      )}
    </div>
  );
}
