# Evaluador de Innovación

Aplicación tipo agente-chat que evalúa proyectos usando documentación y rúbricas, con IA (OpenRouter). Incluye chat con streaming, informe de evaluación en tiempo real, RAG sobre documentos de referencia y exportación a PDF.

## Requisitos

- Node.js 18+
- Cuenta en [OpenRouter](https://openrouter.ai/)

## Instalación

1. Clonar o abrir el proyecto y instalar dependencias:

   ```bash
   npm install
   ```

2. Configurar OpenRouter en `.env.local`:

   ```
   OPENROUTER_API_KEY=tu_clave
   ```

   Opcional:

   ```
   OPENROUTER_MODEL=openrouter/free
   OPENROUTER_EMBEDDING_MODEL=nvidia/llama-nemotron-embed-vl-1b-v2:free
   ```

3. Arrancar en desarrollo:

   ```bash
   npm run dev
   ```

4. Abrir http://localhost:3000

## Uso

- **Header**: Seleccionar el tipo de evaluación y abrir **Configuración** para crear/editar tipos, subir documentación (knowledge), rúbrica y editar el prompt.
- **Knowledge**: Tras subir un documento, la app indexa el RAG automáticamente. Use **Reindexar RAG** si el índice no se generó. Los archivos se pueden eliminar con el botón ✕.
- **Panel izquierdo**: Chat con el agente, botón **Evaluar** para generar el informe, **Subir archivos** para añadir documentos del proyecto.
- **Panel derecho**: Se muestra el informe de evaluación en streaming; botón **PDF** para descargar.

## Notas

- La aplicación no guarda historial de chats.
- Los archivos subidos (knowledge, rúbrica, proyecto) se almacenan en la carpeta `data/` (no se versiona).
- El índice RAG se guarda en `data/{tipo}/vectors/chunks.json`.
- **Chat**: clasifica preguntas (proyecto / rúbrica-config / manual) y usa la pregunta del usuario para buscar en el índice.
- **Evaluación**: analiza cada dimensión de la rúbrica por separado con RAG dedicado y luego fusiona el informe.
- Tras actualizar el indexador, pulse **Reindexar RAG** para regenerar fragmentos con metadatos de página.
