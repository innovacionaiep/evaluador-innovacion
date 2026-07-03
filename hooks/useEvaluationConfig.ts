"use client";

import { useState, useEffect } from "react";
import { knowledgePathsToLabels } from "@/lib/extract-stream";

export type ElementWithSection = {
  title: string;
  section: string;
  description: string;
};

export function useEvaluationConfig(activeTypeId: number | null, configOpen: boolean) {
  const [elementsWithSection, setElementsWithSection] = useState<ElementWithSection[]>([]);
  const [knowledgeDocNames, setKnowledgeDocNames] = useState<string[]>([]);
  const [rubricPrompt, setRubricPrompt] = useState("");

  useEffect(() => {
    if (!activeTypeId) {
      setElementsWithSection([]);
      setKnowledgeDocNames([]);
      setRubricPrompt("");
      return;
    }
    fetch(`/api/config/${activeTypeId}`)
      .then((r) => r.json())
      .then((data) => {
        const elements = Array.isArray(data.elements) ? data.elements : [];
        const mapped = elements
          .filter((e: unknown) => typeof e === "object" && e != null && "title" in e)
          .map((e: { title?: string; section?: string; description?: string }) => ({
            title: String((e as { title: string }).title ?? "").trim(),
            section:
              typeof (e as { section?: string }).section === "string"
                ? ((e as { section: string }).section ?? "General").trim()
                : "General",
            description:
              typeof (e as { description?: string }).description === "string"
                ? (e as { description: string }).description.trim()
                : "",
          }))
          .filter((e: { title: string }) => e.title);
        setElementsWithSection(mapped);
        const paths = Array.isArray(data.knowledge_paths) ? data.knowledge_paths : [];
        setKnowledgeDocNames(knowledgePathsToLabels(paths));
        setRubricPrompt(typeof data.rubric_prompt === "string" ? data.rubric_prompt : "");
      })
      .catch(() => {
        setElementsWithSection([]);
        setKnowledgeDocNames([]);
        setRubricPrompt("");
      });
  }, [activeTypeId, configOpen]);

  return { elementsWithSection, knowledgeDocNames, rubricPrompt };
}
