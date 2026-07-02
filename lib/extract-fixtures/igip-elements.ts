import type { ElementDef } from "@/lib/excel-heuristics";

/** Definiciones IGIP (tipo evaluación 1) — fuente: evaluation_type_config.elements */
export const IGIP_ELEMENT_DEFS: ElementDef[] = [
  {
    title: "Nombre del proyecto",
    description:
      "Nombre del proyecto, título principal. Suele ser el texto más grande visible, o tambien el que está más arriba en el documento.",
    section: "Información General",
  },
  {
    title: "Continuidad de fases anteriores",
    description:
      "Habla de desarrollos previos o fase anteriores al proyecto actual, de años anteriores.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Pertinencia local",
    description:
      'Habla sobre la relevancia de la iniciativa para la zona geográfica donde se realiza. Suele mencionarse explícitamente el concepto "Pertinencia local"',
    section: "Desarrollo Técnico",
  },
  {
    title: "Objetivo General",
    description:
      'Es el objetivo principal o general del proyecto. Siempre se declarará explícitamente usando el concepto de "Objetivo del proyecto", "Objetivo general".',
    section: "Información General",
  },
  {
    title: "Objetivos Específicos",
    description:
      "Suelen ser entre 1 a 4 objetivos. Están declarados textual y explícitamente en el documento.",
    section: "Información General",
  },
  {
    title: "Sedes",
    description:
      "Son sedes geográficas donde se realiza el proyecto. Suelen declararse explícitamente en las secciones principales del documento del proyecto.",
    section: "Información General",
  },
  {
    title: "Escuelas",
    description:
      'Son "escuelas" institucionales que realizan el proyecto.',
    section: "Información General",
  },
  {
    title: "Pertinencia disciplinar",
    description:
      'Habla sobre la relevancia de la iniciativa para la especialidad técnica en que se realiza. Suele mencionarse explícitamente el concepto "Pertinencia disciplinar"',
    section: "Desarrollo Técnico",
  },
  {
    title: "Necesidad, problema u oportunidad",
    description:
      'Se trata de la necesidad, problema u oportunidad que identificó y aborda la iniciativa.',
    section: "Desarrollo Técnico",
  },
  {
    title: "Público objetivo",
    description:
      'Hace referencia a las personas, grupos sociales y localidades donde se implementará.',
    section: "Desarrollo Técnico",
  },
  {
    title: "En qué consiste la solución y cuál es el nivel de avance actual",
    description:
      'Aquí se explica la solución y el grado de avance actual.',
    section: "Desarrollo Técnico",
  },
  {
    title: "Perspectiva de género",
    description:
      'Se habla sobre cómo está integrada en el proyecto la perspectiva de género.',
    section: "Desarrollo Técnico",
  },
  {
    title: "Ejes de impacto",
    description:
      "Suelen ser las categorías generales de impacto del proyecto, por ejemplo ambiental, productivo, social u otras.",
    section: "Desarrollo Técnico",
  },
];
