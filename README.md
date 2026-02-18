# Evaluador de Innovación

Aplicación tipo agente-chat que evalúa proyectos usando documentación y rúbricas, con IA (Groq, modelo qwen3-32b). Incluye chat con streaming, informe de evaluación en tiempo real y exportación a PDF.

## Requisitos

- Node.js 18+
- Cuenta en [Groq](https://console.groq.com/) (nivel gratuito disponible)

## Instalación

1. Clonar o abrir el proyecto y instalar dependencias:

   ```bash
   npm install
   ```

2. Configurar la API key de Groq:

   - Copiar `.env.local.example` a `.env.local`
   - En `.env.local`, asignar tu clave: `GROQ_API_KEY=tu_clave`
   - Obtener una clave en: https://console.groq.com/keys

3. Arrancar en desarrollo:

   ```bash
   npm run dev
   ```

4. Abrir http://localhost:3000

## Uso

- **Header**: Seleccionar el tipo de evaluación y abrir **Configuración** para crear/editar tipos, subir documentación (knowledge), rúbrica y editar el prompt.
- **Panel izquierdo**: Chat con el agente, botón **Evaluar** para generar el informe, **Subir archivos** para añadir documentos del proyecto.
- **Panel derecho**: Se muestra el informe de evaluación en streaming; botón **PDF** para descargar.

## Notas

- La aplicación no guarda historial de chats.
- Los archivos subidos (knowledge, rúbrica, proyecto) se almacenan en la carpeta `data/` (no se versiona).
