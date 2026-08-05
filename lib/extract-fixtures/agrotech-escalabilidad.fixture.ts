import type { ExcelStructuredData } from "@/lib/excel-structured-extract";

/**
 * Layout tipo bitácora AgroTech: etiqueta Escalabilidad larga (A–B fusionadas)
 * y respuesta en C–E. La respuesta puede coincidir con Factor innovador (error de pegado).
 */
export function agrotechEscalabilidadFixture(): ExcelStructuredData {
  const factorAnswer =
    "La innovación se explica en tres ejes:\n\n1. La Novedad (Tecnología para todos): Llevamos tecnología de punta a estudiantes.\n2. La Diferencia: un living lab frente a huertos tradicionales.\n3. El Valor: los jóvenes dejan de ser receptores y pasan a operar la solución.";

  const escalabilidadLabel =
    "Escalabilidad: ¿Existen planes para expandir el\nproyecto?. ¿Existe alguna estrategia para\nadopción de la solución por parte de otros al\nterminar el proyecto?";

  return {
    fileName: "agrotech-escalabilidad.xlsx",
    sheets: [
      {
        sheetName: "Resumen Proyecto",
        merges: [
          { startRow: 30, startCol: 1, endRow: 30, endCol: 2 },
          { startRow: 30, startCol: 3, endRow: 30, endCol: 5 },
          { startRow: 31, startCol: 1, endRow: 31, endCol: 2 },
          { startRow: 31, startCol: 3, endRow: 31, endCol: 5 },
        ],
        cells: [
          {
            row: 30,
            col: 1,
            value: "Factor innovador del proyecto.\nDiferenciación y propuesta de valor.",
          },
          {
            row: 30,
            col: 2,
            value: "Factor innovador del proyecto.\nDiferenciación y propuesta de valor.",
          },
          { row: 30, col: 3, value: factorAnswer },
          { row: 30, col: 4, value: factorAnswer },
          { row: 30, col: 5, value: factorAnswer },
          { row: 31, col: 1, value: escalabilidadLabel },
          { row: 31, col: 2, value: escalabilidadLabel },
          { row: 31, col: 3, value: factorAnswer },
          { row: 31, col: 4, value: factorAnswer },
          { row: 31, col: 5, value: factorAnswer },
        ],
      },
    ],
  };
}
