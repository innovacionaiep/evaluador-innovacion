import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRubricScoreSchemaFromConfig,
  defaultRubricConfigPonderaciones,
  isRubricConfigValid,
  mergeRubricConfig,
  parseRubricFromLegacyText,
  totalWeightPercent,
} from "@/lib/rubric-config";

const LEGACY_TEXT = `----------Dimensión Novedad:-------------
Subdimensión "Grado de Originalidad de la Idea"
- Ponderación (25%)
- Nota 1: Bajo
- Nota 2: Medio
- Nota 3: Alto
- Nota 4: Muy alto

Subdimensión "Estado del arte"
- Ponderación (75%)
- Nota 1: Bajo`;

describe("rubric-config", () => {
  it("default IGIP tiene pesos y escala 1-4", () => {
    const cfg = defaultRubricConfigPonderaciones();
    assert.equal(cfg.type, "ponderaciones");
    assert.equal(cfg.scoreScale.min, 1);
    assert.equal(cfg.scoreScale.max, 4);
    assert.ok(cfg.dimensions.length >= 1);
  });

  it("merge preserva nivel 0 y variables propias desacopladas", () => {
    const cfg = mergeRubricConfig({
      type: "niveles",
      levels: [{ id: "l0", level: 0, title: "Exploración", description: "" }],
      variables: [
        {
          id: "v1",
          name: "Tecnología",
          levels: [{ level: 0, title: "T0", description: "criterio" }],
        },
      ],
    });
    assert.equal(cfg.type, "niveles");
    assert.equal(cfg.type === "niveles" ? cfg.levels[0].level : null, 0);
    assert.equal(cfg.type === "niveles" ? cfg.variables[0].name : null, "Tecnología");
    assert.equal(cfg.type === "niveles" ? cfg.variables[0].levels[0].level : null, 0);
    assert.equal(cfg.type === "niveles" ? cfg.variables[0].levels.length : null, 1);
  });

  it("merge fuerza niveles para IMET y siembra variables oficiales si están vacías", () => {
    const cfg = mergeRubricConfig({}, "IMET");
    assert.equal(cfg.type, "niveles");
    assert.ok(cfg.type === "niveles" && cfg.variables.length === 6);
    assert.ok(cfg.type === "niveles" && cfg.variables[0].levels.length === 5);
    assert.equal(cfg.type === "niveles" ? cfg.levels[0].level : null, 1);
  });

  it("merge no sobrescribe variables IMET ya configuradas", () => {
    const cfg = mergeRubricConfig(
      {
        type: "niveles",
        levels: [{ id: "l1", level: 1, title: "N1", description: "" }],
        variables: [
          {
            id: "v1",
            name: "Custom",
            levels: [{ level: 1, title: "A", description: "x" }],
          },
        ],
      },
      "IMET"
    );
    assert.equal(cfg.type === "niveles" ? cfg.variables.length : 0, 1);
    assert.equal(cfg.type === "niveles" ? cfg.variables[0].name : null, "Custom");
  });

  it("merge fuerza ponderaciones para IGIP aunque el JSON diga niveles", () => {
    const cfg = mergeRubricConfig({ type: "niveles", levels: [], variables: [] }, "IGIP");
    assert.equal(cfg.type, "ponderaciones");
  });

  it("parse legacy text produce ponderaciones", () => {
    const parsed = parseRubricFromLegacyText(LEGACY_TEXT);
    assert.ok(parsed);
    assert.equal(parsed!.dimensions[0].name, "Novedad");
    assert.equal(parsed!.dimensions[0].subdimensions[0].weightPercent, 25);
  });

  it("buildRubricScoreSchemaFromConfig genera entradas IGIP", () => {
    const cfg = parseRubricFromLegacyText(LEGACY_TEXT)!;
    const schema = buildRubricScoreSchemaFromConfig(cfg);
    assert.equal(schema.length, 2);
    assert.equal(schema[0].weight, 25);
  });

  it("buildRubricScoreSchemaFromConfig genera columnas por variable IMET", () => {
    const cfg = mergeRubricConfig({}, "IMET");
    assert.equal(cfg.type, "niveles");
    const schema = buildRubricScoreSchemaFromConfig(cfg);
    assert.equal(schema.length, 6);
    assert.ok(schema[0].key.startsWith("variable:"));
  });

  it("merge fuerza trl vacío para TRL", () => {
    const cfg = mergeRubricConfig({}, "TRL");
    assert.equal(cfg.type, "trl");
    assert.equal(cfg.type === "trl" ? cfg.levels.length : -1, 0);
    assert.equal(isRubricConfigValid(cfg), false);
  });

  it("buildRubricScoreSchemaFromConfig genera una columna Nivel TRL", () => {
    const cfg = mergeRubricConfig(
      {
        type: "trl",
        levels: [
          { id: "t1", level: 1, title: "TRL 1", description: "Principios" },
          { id: "t2", level: 2, title: "TRL 2", description: "Concepto" },
        ],
      },
      "TRL"
    );
    assert.equal(isRubricConfigValid(cfg), true);
    const schema = buildRubricScoreSchemaFromConfig(cfg);
    assert.equal(schema.length, 1);
    assert.equal(schema[0].name, "Nivel TRL");
    assert.equal(schema[0].key, "trl:nivel");
  });

  it("validación niveles exige subniveles propios por variable", () => {
    const ok = mergeRubricConfig({}, "IMET");
    assert.equal(isRubricConfigValid(ok), true);
    assert.equal(
      isRubricConfigValid({
        type: "niveles",
        levels: [{ id: "l1", level: 1, title: "N1", description: "" }],
        variables: [{ id: "v1", name: "X", levels: [] }],
      }),
      false
    );
  });

  it("validación exige peso 100%", () => {
    const cfg = defaultRubricConfigPonderaciones();
    assert.equal(isRubricConfigValid(cfg), true);
    const bad = { ...cfg, dimensions: [{ ...cfg.dimensions[0], subdimensions: [] }] };
    assert.equal(isRubricConfigValid(bad), false);
    assert.equal(totalWeightPercent(cfg), 100);
  });
});
