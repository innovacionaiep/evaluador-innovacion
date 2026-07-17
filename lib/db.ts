/**
 * Capa pública de persistencia — Supabase (Postgres) únicamente.
 * Requiere DATABASE_URL o POSTGRES_URL en el entorno.
 */
export type {
  ConfigRowPostgres as ConfigRow,
  EvaluationTypeRow,
  ConfigUpdateData,
  EvaluationHistoryListItem,
  EvaluationHistoryRow,
  EvaluationHistoryCreateInput,
} from "./db-postgres";

export {
  ensureDb as initDb,
  getEvaluationTypesPostgres as getEvaluationTypes,
  getEvaluationTypeByIdPostgres as getEvaluationTypeById,
  createEvaluationTypePostgres as createEvaluationType,
  updateEvaluationTypePostgres as updateEvaluationType,
  deleteEvaluationTypePostgres as deleteEvaluationType,
  getConfigPostgres as getConfig,
  updateConfigPostgres as updateConfig,
  getLlmModelsPostgres as getLlmModels,
  saveLlmModelsPostgres as saveLlmModels,
  getLlmParamsPostgres as getLlmParams,
  saveLlmParamsPostgres as saveLlmParams,
  getChatAgentConfigPostgres as getChatAgentConfig,
  saveChatAgentConfigPostgres as saveChatAgentConfig,
  backfillEmptyTypeConfigsPostgres as backfillEmptyTypeConfigs,
  createEvaluationHistoryPostgres as createEvaluationHistory,
  listEvaluationHistoryPostgres as listEvaluationHistory,
  getEvaluationHistoryByIdPostgres as getEvaluationHistoryById,
  deleteEvaluationHistoryPostgres as deleteEvaluationHistory,
  updateEvaluationHistoryProjectNamePostgres as updateEvaluationHistoryProjectName,
} from "./db-postgres";
