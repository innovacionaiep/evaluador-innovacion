import type {
  RubricConfigNiveles,
  RubricVariableConfig,
  RubricVariableLevelConfig,
} from "@/lib/rubric-config";

function newId(): string {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function vl(
  level: number,
  title: string,
  description: string
): RubricVariableLevelConfig {
  return { level, title, description };
}

function variable(
  name: string,
  levels: RubricVariableLevelConfig[]
): RubricVariableConfig {
  return { id: newId(), name, levels };
}

/** 6 variables × 5 subniveles oficiales IMET AIEP (texto de la rúbrica). */
export function imetOfficialVariables(): RubricVariableConfig[] {
  return [
    variable("Definición del Problema", [
      vl(
        1,
        "Exploración",
        "Problema difuso o poco claro. Existe una descripción muy general del problema u oportunidad, sin evidencia que permita comprender su relevancia o magnitud."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "Problema descrito de forma preliminar. El problema se encuentra claramente definido, pero no incorpora datos relevantes que permitan dimensionar su relevancia."
      ),
      vl(
        3,
        "Problema estructurado",
        "El problema se encuentra documentado y respaldado con información relevante (datos secundarios, observaciones o primeras entrevistas), permitiendo justificar su existencia."
      ),
      vl(
        4,
        "Problema validado",
        "El problema ha sido validado mediante entrevistas, encuestas u otras técnicas con usuarios potenciales, confirmando que representa una necesidad real."
      ),
      vl(
        5,
        "Problema validado comercialmente",
        "Existe evidencia de que el problema genera una necesidad suficientemente relevante como para motivar intención de compra, adopción o búsqueda activa de soluciones por parte del mercado."
      ),
    ]),
    variable("Solución / Propuesta de Valor", [
      vl(
        1,
        "Exploración",
        "Existe una idea general de solución, sin explicar claramente cómo resuelve el problema ni cuál es su propuesta de valor."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "La solución se encuentra definida conceptualmente y explica de manera general el beneficio que entregará al cliente."
      ),
      vl(
        3,
        "Solución estructurada",
        "La propuesta de valor está claramente desarrollada, diferenciando atributos, beneficios y factores distintivos respecto de otras alternativas."
      ),
      vl(
        4,
        "Solución validada",
        "La solución ha sido presentada a usuarios potenciales y se ha ajustado en función del feedback recibido."
      ),
      vl(
        5,
        "Solución validada comercialmente",
        "Existe evidencia de aceptación de la propuesta de valor mediante pilotos, primeras ventas, usuarios activos, cartas de intención o disposición de pago."
      ),
    ]),
    variable("Segmento de Cliente", [
      vl(
        1,
        "Exploración",
        "Cliente no definido. No identifica claramente quién utilizará o comprará la solución, o menciona un público demasiado amplio o ambiguo."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "Cliente identificado de forma general. Reconoce un grupo de clientes potenciales, pero sin caracterizarlo ni justificar por qué representa el mercado objetivo."
      ),
      vl(
        3,
        "Segmento de clientes estructurado",
        "Describe con claridad el segmento objetivo, identificando características relevantes como perfil, necesidades, contexto o comportamiento de los clientes. Incorpora primeras validaciones o acercamiento al cliente mediante entrevistas, observaciones u otras instancias de contacto con usuarios."
      ),
      vl(
        4,
        "Segmento validado con usuarios o clientes reales",
        "El segmento objetivo ha sido validado confirmando que corresponde al cliente que presenta el problema y tiene interés en adquirir la solución."
      ),
      vl(
        5,
        "Segmento validado comercialmente",
        "Existe evidencia de que el segmento definido corresponde efectivamente a clientes interesados en adquirir o utilizar la solución. El proyecto logra una manifestación de interés de compra real."
      ),
    ]),
    variable("Desarrollo de Prototipo", [
      vl(
        1,
        "Exploración",
        "No existe un prototipo o representación tangible de la solución."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "Existe una representación conceptual de la solución (boceto, esquema, wireframe, mockup o equivalente)."
      ),
      vl(
        3,
        "Prototipo conceptual",
        "Se dispone de un prototipo de baja fidelidad o MVP inicial que permite representar el funcionamiento de la solución."
      ),
      vl(
        4,
        "Prototipo funcional preparado para validación",
        "Existe un prototipo funcional que permite ejecutar pruebas piloto o validaciones en un entorno real."
      ),
      vl(
        5,
        "Prototipo validado comercialmente",
        "El prototipo ha sido utilizado por clientes o usuarios reales y existe evidencia de uso, ventas iniciales o resultados obtenidos durante pilotos."
      ),
    ]),
    variable("Validación con Usuarios / Mercado", [
      vl(
        1,
        "Exploración",
        "No se han realizado actividades de validación con usuarios o clientes potenciales."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "Se han efectuado conversaciones exploratorias o entrevistas iniciales para comprender el problema."
      ),
      vl(
        3,
        "Validación inicial",
        "Se obtienen datos relevantes que validan el problema, el mercado y el interés por la solución."
      ),
      vl(
        4,
        "Validación en entorno real",
        "Se realizan pruebas con usuarios utilizando prototipos, obteniendo retroalimentación para mejorar la solución."
      ),
      vl(
        5,
        "Validación comercial temprana",
        "La solución se prueba mediante pilotos o implementaciones reales, generando evidencia sobre su funcionamiento y aceptación. Existe evidencia concreta de interés comercial,"
      ),
    ]),
    variable("Modelo de Negocio", [
      vl(
        1,
        "Exploración",
        "Existe una idea vaga o versión muy básica del modelo de negocios."
      ),
      vl(
        2,
        "Oportunidad formulada",
        "Existe una versión inicial sobre clientes, ingresos y propuesta de valor, aunque aún no ha hecho validaciones del Modelo de negocios."
      ),
      vl(
        3,
        "Modelo estructurado",
        "El modelo de negocio se encuentra desarrollado mediante herramientas como Business Model Canvas o equivalente, con sus componentes principales definidos. Se realizan acciones como entrevistas y encuestas que validan su propuesta de valor y el cliente al cual está enfocado el emprendimiento."
      ),
      vl(
        4,
        "Modelo validado",
        "Los principales supuestos del modelo han sido contrastados con usuarios o potenciales clientes y se han realizado ajustes."
      ),
      vl(
        5,
        "Modelo validado comercialmente",
        "El modelo demuestra viabilidad inicial mediante evidencia de ingresos, disposición de pago, clientes, pilotos remunerados u otros indicadores comerciales."
      ),
    ]),
  ];
}

/** Niveles principales solo como referencia visual (no alineados a variables). */
export function imetReferenceMainLevels() {
  return [
    {
      id: newId(),
      level: 1,
      title: "Exploración",
      description: "Referencia visual. La evaluación se realiza por variables y subniveles.",
    },
    {
      id: newId(),
      level: 2,
      title: "Oportunidad formulada",
      description: "Referencia visual. La evaluación se realiza por variables y subniveles.",
    },
    {
      id: newId(),
      level: 3,
      title: "Estructurado",
      description: "Referencia visual. La evaluación se realiza por variables y subniveles.",
    },
    {
      id: newId(),
      level: 4,
      title: "Validado",
      description: "Referencia visual. La evaluación se realiza por variables y subniveles.",
    },
    {
      id: newId(),
      level: 5,
      title: "Validado comercialmente",
      description: "Referencia visual. La evaluación se realiza por variables y subniveles.",
    },
  ];
}

/** Rúbrica oficial IMET: variables con subniveles propios; niveles principales de referencia. */
export function imetOfficialRubric(): RubricConfigNiveles {
  return {
    type: "niveles",
    levels: imetReferenceMainLevels(),
    variables: imetOfficialVariables(),
  };
}

/**
 * Si IMET no tiene variables configuradas, siembra la rúbrica oficial.
 * No sobrescribe variables ya editadas.
 */
export function seedImetRubricIfEmpty(
  rubric: RubricConfigNiveles
): RubricConfigNiveles {
  if (rubric.variables.length > 0) return rubric;
  const official = imetOfficialRubric();
  const looksLikePlaceholder =
    rubric.levels.length === 0 ||
    (rubric.levels.length === 9 &&
      rubric.levels.every(
        (l, i) => l.level === i && /^Nivel\s+\d+$/i.test(l.title.trim())
      ));
  return {
    type: "niveles",
    levels: looksLikePlaceholder ? official.levels : rubric.levels,
    variables: official.variables,
  };
}
