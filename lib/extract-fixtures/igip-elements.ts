import type { ElementDef } from "@/lib/excel-heuristics";

/** Definiciones IGIP — alineadas con evaluation_type_config.elements en producción. */
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
      "Habla de desarrollos previos o fase anteriores al proyecto actual, de años anteriores. Se suele comentar lo que se hizo y/o se logró en esa fase anterior. También se suele comentar la diferenciación entre la fase anterior y esta nueva fase, los elementos innovadores de esta fase respecto a la anterior.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Pertinencia local",
    description:
      "Habla sobre la relevancia de la iniciativa para la zona geográfica donde se realiza. Suele mencionarse explícitamente el concepto \"Pertinencia local\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "Objetivo General",
    description:
      "Es el objetivo principal o general del proyecto. Siempre se declarará explícitamente usando el concepto de \"Objetivo del proyecto\", \"Objetivo general\" y acompañado de ello un breve texto. Suele ser visible en la partes principales de los documentos.",
    section: "Información General",
  },
  {
    title: "Objetivos Específicos",
    description:
      "Suelen ser entre 1 a 4 objetivos. Están declarados textual y explícitamente en el documento. Suelen estar en las partes superiores del documento, cercanos al nombre del proyecto o el objetivo general. Debes hacer muy bien la distincion entre objetivo general y específicos, ya que son distintos. Los objetivos específicos son los sub-objetivos a través de los cuales se logrará el objetivo general.",
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
      "Son \"escuelas\" institucionales que realizan el proyecto. Suelen declararse explícitamente en las secciones principales de los documentos del proyecto.",
    section: "Información General",
  },
  {
    title: "Pertinencia disciplinar",
    description:
      "Habla sobre la relevancia de la iniciativa para la especialidad ténica en que se realiza. Suele mencionarse explícitamente el concepto \"Pertinencia disciplinar\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "Necesidad, problema u oportunidad",
    description:
      "Se trata de la necidad, problema u oportunidad que identificó y aborda la iniciativa. Suele declararse explícitamente en el documento del proyecto bajo ese título \"Necidad, problema u oportunidad detectada\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "Público objetivo",
    description:
      "Hace referencia a las personas, grupos sociales y localidades donde se implementará, o a quienes se proveerá la solución. Suele indicarse explícitamente en los documentos bajo el título de \"Público objetivo\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "En qué consiste la solución y cuál es el nivel de avance actual",
    description:
      "Aquí se explica la solución y el grado de avance actual. También se suele comentar si ha adquirido financiamiento en fases anteriores de su desarrollo. Suele indicarse explícitamente en los documentos del proyecto bajo el titulo de \"En qué consiste la solución y cuál es el nivel de avance actual\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "Perspectiva de género",
    description:
      "Se habla sobre cómo está integrada en el proyecto la perspectiva de género. Suele estar declarada excplícitamente en los archivos del proyecto con ese titulo de \"Perspectiva de género\"",
    section: "Desarrollo Técnico",
  },
  {
    title: "Ejes de impacto o focalizaciones",
    description:
      "Suelen ser las categorías generales de impacto del proyecto o también llamadas \"focalizaciones\", por ejemplo ambiental, productivo, social u otras. Suelen declararse explicitamente en el archivo del proyecto. Aquí es necesario identificar cuáles ejes de impacto aborda el proyecto, pero también de qué manera declara abordarlas.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Sostenibilidad",
    description:
      "\"¿Cómo se integra la sostenibilidad en el proyecto?\", Suele declararse en el documento respondiendo a esta pregunta. Hace referencia a elementos de autosustentabilidad y sostenibilidad en el tiempo del proyecto, además de cómo aborda brechas de sostenibilidad relevantes de su entorno pertinente tanto local como disciplinar.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Objetivo de Desarrollo Sostenible",
    description:
      "Se suele declarar explicitamente en el proyecto a cual ODS (Objetivos de desarrollo sostenible de las naciones unidas) apunta. En caso de que no lo mencione explícitamente, se debe inferir a cuál apunta y de qué manera lo aborda.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Resultados y contribución esperada",
    description:
      "Se suele mencionar explícitamente en el documento al lado del texto \"Resultados y contribución esperada\". Hace referencia a cuál es el resultado final que busca el proyecto. El resultado tangible que debería tener el proyecto, de una manera medible y cuantificada.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Metodología para medición de resultados",
    description:
      "Suele declararse explicitamente en el documento cercano al título \"Metodología para medición de resultados\". Hace referencia a la manera, metodologías con la que se medirán estos resultados tangibles del proyecto.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Factor innovador del proyecto",
    description:
      "Suele declararse explícitamente en el documento del proyecto cercano al título \"Factor innovador del proyecto\". Hace referencia a la Diferenciación y propuesta de valor diferenciadora de este proyecto.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Escalabilidad",
    description:
      "Suele declararse exlícitamente en el documento del proyecto, cercano a la siguiente pregunta \"Escalabilidad: ¿Existen planes para expandir el\nproyecto?. ¿Existe alguna estrategia para\nadopción de la solución por parte de otros al\nterminar el proyecto?\". En caso de que no esté textual, se debe buscar cómo el proyecto responde a estas preguntas.",
    section: "Desarrollo Técnico",
  },
  {
    title: "Actividades del proyecto",
    description:
      "Esta es una seccion extensa del documento, donde se encuentran nombres de actividad, descripción de actividad, tareas a realizar, evidencias a presentar, meses marcados con \"X\" y estado de avance en porcentaje. Lo relevante en esta sección es solo poner un listado completo de Nombre de actividad - Descripción de Actividad. Solo esos dos elementos \"Nombre de Actividad y Descripción de Actividad\" son relevantes para poder generar el análisis posterior, así que solo limítate a listarlas.",
    section: "Plan de Actividades (Gantt)",
  },
  {
    title: "Indicadores",
    description:
      "Esta es una sección extensa del documento, donde se están mostrando en una tabla el objetivo general, los objetivos específicos, y relacionados a estos se encuentran nombres de indicadores, descripciones de indicadores, formas de cálculo, resultados esperados, resultado alcanzado, porcentaje de cumplimiento, porcentaje de avance y evidencias. En esta sección solo es relevante listar \"Nombre de indicador - Descripción del indicador - forma de cálculo - Resultado esperado\". Solo limítate a listar esos elementos.",
    section: "Indicadores",
  },
];
