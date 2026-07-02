import type { ExcelStructuredData } from "@/lib/excel-structured-extract";

/** Fragmento estilo bitácora CONenergía / IGIP TRL ampliado. */
export function conenergiaTrlFixture(): ExcelStructuredData {
  const ejesAnswer =
    "El eje social se aborda capacitando a vecinos en eficiencia energética. El eje medioambiental promueve el ahorro de energía y menor huella. El eje productivo vincula a PYMEs locales con buenas prácticas eléctricas.";
  const sostenibilidadAnswer =
    "El proyecto integra sostenibilidad mediante talleres de eficiencia energética, reducción de consumo y concientización sobre riesgos eléctricos en hogares de la comuna.";
  const odsAnswer =
    "ODS 7: Energía asequible y no contaminante, mediante educación en eficiencia energética y seguridad eléctrica.";
  const resultadosAnswer =
    "Se espera capacitar a más de 80 familias, reducir incidentes por mal uso de la red eléctrica y mejorar percepción de riesgos según encuestas pre y post.";
  const factorInnovadorAnswer =
    "Sí. El proyecto combina capacitación técnica con concursos de diseño gráfico para difundir mensajes de eficiencia energética de forma participativa.";
  const escalabilidadAnswer =
    "Sí, se prevé replicar los talleres en otras comunas del territorio y compartir materiales con otras sedes del instituto al finalizar el proyecto.";

  return {
    fileName: "conenergia.xlsx",
    sheets: [
      {
        sheetName: "Resumen Proyecto",
        merges: [
          { startRow: 4, startCol: 1, endRow: 4, endCol: 1 },
          { startRow: 30, startCol: 2, endRow: 32, endCol: 5 },
        ],
        cells: [
          { row: 4, col: 1, value: "Focalización" },
          { row: 4, col: 2, value: "social, medioambiental, productivo" },
          {
            row: 28,
            col: 1,
            value:
              "Ejes de impacto o focalizaciones. Indique cómo el proyecto aborda cada eje de impacto.",
          },
          { row: 28, col: 2, value: ejesAnswer },
          {
            row: 29,
            col: 1,
            value: "¿Cómo se integra la sostenibilidad en el proyecto?",
          },
          { row: 29, col: 2, value: sostenibilidadAnswer },
          {
            row: 30,
            col: 1,
            value: "Objetivo de Desarrollo Sostenible al que apunta el proyecto.",
          },
          { row: 30, col: 2, value: odsAnswer },
          {
            row: 31,
            col: 1,
            value: "Resultados y contribución esperada.",
          },
          { row: 31, col: 2, value: resultadosAnswer },
          {
            row: 32,
            col: 1,
            value:
              "Metodología para medición de resultados. Indique cómo se medirán los resultados.",
          },
          {
            row: 32,
            col: 2,
            value:
              "Se aplicarán encuestas de satisfacción a participantes e instructores, evaluando cambios en percepción de riesgos eléctricos y eficiencia energética.",
          },
          {
            row: 33,
            col: 1,
            value: "Factor innovador del proyecto.",
          },
          { row: 33, col: 2, value: "No" },
          { row: 34, col: 2, value: factorInnovadorAnswer },
          {
            row: 35,
            col: 1,
            value:
              "¿Existen planes para expandir el proyecto? ¿Existe alguna estrategia para adopción de la solución por parte de otros al terminar el proyecto?",
          },
          { row: 35, col: 2, value: escalabilidadAnswer },
          {
            row: 40,
            col: 1,
            value: "En qué consiste la solución y cuál es el nivel de avance actual.",
          },
          {
            row: 40,
            col: 2,
            value:
              "La norma ISO 50001 establece un marco para la gestión de la energía. El proyecto nace desde cero y busca visibilizar el consumo de pequeños usuarios.",
          },
        ],
      },
      {
        sheetName: "Gantt",
        merges: [],
        cells: [
          { row: 1, col: 1, value: "Nombre de la actividad" },
          { row: 1, col: 2, value: "Descripción de actividad" },
          { row: 1, col: 3, value: "Responsable" },
          { row: 2, col: 1, value: "Diagnóstico de consumo en hogares piloto" },
          { row: 2, col: 2, value: "Relevamiento del consumo eléctrico en hogares seleccionados." },
          { row: 2, col: 3, value: "Equipo técnico" },
          { row: 3, col: 1, value: "Talleres de eficiencia energética" },
          { row: 3, col: 2, value: "Capacitación a familias en buenas prácticas de consumo." },
          { row: 3, col: 3, value: "Docentes electricidad" },
          { row: 4, col: 1, value: "Concurso de diseño gráfico" },
          { row: 4, col: 2, value: "Concurso de afiches sobre eficiencia energética." },
          { row: 4, col: 3, value: "Escuela diseño" },
        ],
      },
      {
        sheetName: "Indicadores",
        merges: [],
        cells: [
          { row: 1, col: 1, value: "Indicador" },
          { row: 1, col: 2, value: "Meta" },
          { row: 1, col: 3, value: "Medio de verificación" },
          {
            row: 2,
            col: 1,
            value: "Familias capacitadas en eficiencia energética",
          },
          { row: 2, col: 2, value: "80" },
          { row: 2, col: 3, value: "Listado de asistencia y encuestas" },
          {
            row: 3,
            col: 1,
            value: "Participantes en concurso de diseño",
          },
          { row: 3, col: 2, value: "30" },
          { row: 3, col: 3, value: "Registro del concurso" },
        ],
      },
    ],
  };
}
