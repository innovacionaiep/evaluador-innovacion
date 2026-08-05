import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildElementLlmHints,
  getIgipElementHints,
  getImetElementHints,
  getMandatoryRetryHint,
} from "@/lib/eval-types/extract-hints";

describe("extract-hints", () => {
  it("getMandatoryRetryHint distingue IGIP e IMET", () => {
    assert.match(getMandatoryRetryHint("IGIP"), /Resumen Proyecto/);
    assert.match(getMandatoryRetryHint("IMET"), /formulario IMET/i);
    assert.equal(getMandatoryRetryHint("otro"), getMandatoryRetryHint("IGIP"));
  });

  it("getIgipElementHints aplica reglas IGIP", () => {
    const hints = getIgipElementHints({
      title: "Necesidad, problema u oportunidad",
      description: "",
    });
    assert.ok(hints.some((h) => h.includes("Necesidad, problema")));
  });

  it("getIgipElementHints Escalabilidad prioriza fila etiquetada", () => {
    const hints = getIgipElementHints({
      title: "Escalabilidad",
      description: "Planes de expansión",
    });
    assert.ok(hints.some((h) => /Escalabilidad/i.test(h)));
    assert.ok(hints.some((h) => /no devuelvas vacío/i.test(h)));
  });

  it("getImetElementHints aplica reglas IMET", () => {
    const hints = getImetElementHints({
      title: "Nombre del proyecto",
      description: "",
    });
    assert.ok(hints.some((h) => h.includes("emprendimiento")));
  });

  it("IMET no recibe pista de nombre del emprendimiento en IGIP", () => {
    const igip = getIgipElementHints({ title: "Nombre del proyecto", description: "" });
    const imet = getImetElementHints({ title: "Nombre del proyecto", description: "" });
    assert.ok(!igip.some((h) => /emprendimiento/i.test(h)));
    assert.ok(imet.some((h) => /emprendimiento/i.test(h)));
  });

  it("buildElementLlmHints incluye hints del elemento", () => {
    const out = buildElementLlmHints(
      {
        title: "Campo custom",
        description: "",
        extractStrategy: { llmHints: "Buscar en hoja X" },
      },
      "IGIP"
    );
    assert.match(out, /Buscar en hoja X/);
  });
});
