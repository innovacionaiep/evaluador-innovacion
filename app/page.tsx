"use client";

import { useState, useEffect, useRef } from "react";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";
import ReportPanel from "@/components/ReportPanel";
import ConfigPanel from "@/components/ConfigPanel";
import FullscreenOverlay, { ExpandIcon } from "@/components/FullscreenOverlay";
import ProjectExtractedTable from "@/components/ProjectExtractedTable";
import type { ChatMessage } from "@/components/ChatPanel";
import type { ProjectStructuredData } from "@/lib/build-context";
import { useEvaluationConfig } from "@/hooks/useEvaluationConfig";
import { useProjectExtract } from "@/hooks/useProjectExtract";
import { isIncompleteElement } from "@/lib/project-extract-validate";

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
  const [projectSectionOpen, setProjectSectionOpen] = useState(true);
  const [fullscreenSection, setFullscreenSection] = useState<"project" | "report" | null>(null);
  const prevActiveTypeIdRef = useRef<number | null>(null);

  const { elementsWithSection, knowledgeDocNames } = useEvaluationConfig(activeTypeId, configOpen);

  const {
    extractedProjectText,
    extractedProjectTable,
    setExtractedProjectTable,
    extractedStructuredData,
    extractedProjectLoading,
    resetExtract,
  } = useProjectExtract(projectFilePaths, activeTypeId, SESSION_ID, knowledgeDocNames, setMessages);

  /** Al cambiar de tipo de evaluación, limpiar la UI principal (chat, informe, proyecto). */
  useEffect(() => {
    if (activeTypeId == null) return;
    if (prevActiveTypeIdRef.current != null && prevActiveTypeIdRef.current !== activeTypeId) {
      setMessages([]);
      setReportContent("");
      setProjectFilePaths([]);
      resetExtract();
      setFullscreenSection(null);
    }
    prevActiveTypeIdRef.current = activeTypeId;
  }, [activeTypeId, resetExtract]);

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

  const mergeProjectElementsFromChat = (updated: { element: string; content: string }[]) => {
    setExtractedProjectTable((prev) => {
      const byTitle = new Map(updated.map((r) => [r.element, r.content]));
      return prev.map((row) => {
        const newContent = byTitle.get(row.element);
        if (newContent === undefined) return row;
        const cfg = elementsWithSection.find((e) => e.title === row.element);
        const def = cfg
          ? { title: cfg.title, description: cfg.description, section: cfg.section }
          : { title: row.element, description: "", section: row.section ?? "General" };
        return {
          ...row,
          content: newContent,
          incomplete: isIncompleteElement(def, newContent),
        };
      });
    });
  };

  const tableRows =
    extractedProjectTable.length > 0
      ? extractedProjectTable.map((r) => ({
          section: r.section ?? "—",
          element: r.element,
          content: r.content,
          incomplete: r.incomplete,
        }))
      : parseElementoContenido(extractedProjectText?.trim() || "").map(([elem, cont]) => ({
          section: "—",
          element: elem,
          content: cont,
        }));

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
            key={activeTypeId ?? "no-type"}
            messages={messages}
            onMessagesChange={setMessages}
            reportContent={reportContent}
            onReportContentChange={setReportContent}
            activeTypeId={activeTypeId}
            projectFilePaths={projectFilePaths}
            onProjectFilePathsChange={setProjectFilePaths}
            projectElementsTable={extractedProjectTable}
            projectStructuredData={
              !extractedProjectTable.length && extractedStructuredData
                ? (extractedStructuredData as ProjectStructuredData)
                : undefined
            }
            sessionId={SESSION_ID}
            onProjectElementsTableChange={mergeProjectElementsFromChat}
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
                  {extractedProjectLoading ? (
                    "Extrayendo con IA…"
                  ) : (
                    <ProjectExtractedTable
                      rows={tableRows}
                      elementsWithSection={elementsWithSection}
                      extractedProjectText={extractedProjectText}
                    />
                  )}
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
            {extractedProjectLoading ? (
              "Extrayendo con IA…"
            ) : (
              <ProjectExtractedTable
                rows={tableRows}
                elementsWithSection={elementsWithSection}
                extractedProjectText={extractedProjectText}
              />
            )}
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
