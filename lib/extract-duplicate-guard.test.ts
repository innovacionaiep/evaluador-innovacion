import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areContentsDuplicate,
  findDuplicateContentGroups,
} from "@/lib/extract-duplicate-guard";
import {
  looksLikeContinuityAnswer,
  splitContinuityFromInnovatorTail,
} from "@/lib/extract-content-clean";
import { isLikelyGanttHeaderRowContent } from "@/lib/excel-sheet-priority";
import { isIncompleteElement } from "@/lib/project-extract-validate";

const GANTT_ELEMENT = {
  title: "Actividades del proyecto",
  section: "Plan de Actividades (Gantt)",
  description: "Solo nombre y descripción de actividad",
};

describe("extract duplicate guard", () => {
  it("detecta contenidos casi idénticos", () => {
    const a = "Sí. El proyecto es continuidad y evolución de Patagón Emprende con fase anterior clara.";
    const b = a + " ";
    assert.equal(areContentsDuplicate(a, b), true);
  });

  it("agrupa filas duplicadas", () => {
    const text =
      "Sí. El proyecto es continuidad y evolución de Patagón Emprende creada para el programa de innovación abierta con fase anterior documentada.";
    const groups = findDuplicateContentGroups([
      { section: "A", element: "Continuidad de fases anteriores", content: text },
      { section: "B", element: "Factor innovador del proyecto", content: text },
      { section: "C", element: "Sedes", content: "Puerto Montt" },
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].titles.length, 2);
  });
});

describe("continuity vs innovador split", () => {
  it("corta bloque de elementos innovadores al final de continuidad", () => {
    const raw =
      "Sí, continúa Patagón Emprende. **Principales elementos innovadores y diferenciadores son:** incorporación de datos.";
    const cut = splitContinuityFromInnovatorTail(raw);
    assert.doesNotMatch(cut, /Principales elementos innovadores/i);
    assert.match(cut, /Patagón Emprende/i);
  });

  it("detecta respuesta de continuidad mal asignada a factor innovador", () => {
    assert.equal(
      looksLikeContinuityAnswer(
        "Sí. El proyecto es continuidad y evolución de Patagón Emprende en una nueva fase."
      ),
      true
    );
    assert.equal(
      looksLikeContinuityAnswer(
        "El proyecto se diferencia porque integra un ecosistema colaborativo territorial."
      ),
      false
    );
  });
});

describe("gantt incomplete validation", () => {
  it("lista numerada de actividades no queda incompleta", () => {
    const el = GANTT_ELEMENT;
    const content = `1. Registro de iniciativa en plataforma
Descripción del registro básico.

2. Diagnóstico y levantamiento de necesidades
Reuniones con emprendedores y estudiantes.

3. Diseño y planificación estratégica
Definición de funcionalidades.`;
    assert.equal(isIncompleteElement(el, content), false);
    assert.equal(isLikelyGanttHeaderRowContent(content), false);
  });
});
