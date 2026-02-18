"use client";

import { useState, useEffect } from "react";
import Header from "@/components/Header";
import ChatPanel from "@/components/ChatPanel";
import ReportPanel from "@/components/ReportPanel";
import ConfigPanel from "@/components/ConfigPanel";
import type { ChatMessage } from "@/components/ChatPanel";

type EvaluationType = { id: number; name: string };

const SESSION_ID = "default";

export default function Home() {
  const [evaluationTypes, setEvaluationTypes] = useState<EvaluationType[]>([]);
  const [activeTypeId, setActiveTypeId] = useState<number | null>(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [reportContent, setReportContent] = useState("");
  const [reportTitle, setReportTitle] = useState("TITULO DEL INFORME DE EVALUACIÓN");
  const [projectFilePaths, setProjectFilePaths] = useState<string[]>([]);

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
            sessionId={SESSION_ID}
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <ReportPanel title={reportTitle} body={reportContent} />
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
    </div>
  );
}
