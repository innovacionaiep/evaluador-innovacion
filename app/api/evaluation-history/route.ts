import { NextResponse } from "next/server";
import {
  createEvaluationHistory,
  listEvaluationHistory,
  type EvaluationHistoryCreateInput,
} from "@/lib/db";
import type { RubricScoreSchemaEntry } from "@/lib/evaluation-scores";
import { resolveHistoryEvaluationTypeId } from "@/lib/evaluation-history-resolve";
import { ensureTrlScoresFromText } from "@/lib/trl-score-recover";
import { TRL_LEVEL_SCORE_KEY, TRL_LEVEL_SCORE_NAME } from "@/lib/rubric-config";
import { isTrl } from "@/lib/eval-types/constants";

export const dynamic = "force-dynamic";

type HistoryPostBody = Partial<EvaluationHistoryCreateInput> & {
  evaluationTypeId?: number | null;
  evaluationTypeName?: string;
  projectName?: string;
  fileName?: string;
  reportContent?: string;
  subdimensionScores?: Record<string, number | null>;
  overallScore?: number | null;
  scoreSchema?: RubricScoreSchemaEntry[];
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 100;
    const typeName =
      searchParams.get("type")?.trim() ||
      searchParams.get("evaluationTypeName")?.trim() ||
      null;
    const items = await listEvaluationHistory(
      Number.isFinite(limit) ? limit : 100,
      typeName ? { typeName } : undefined
    );
    return NextResponse.json(items);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HistoryPostBody;
    const evaluationTypeName = (
      typeof body.evaluation_type_name === "string"
        ? body.evaluation_type_name
        : (body.evaluationTypeName ?? "")
    ).trim();
    const projectName = (
      typeof body.project_name === "string"
        ? body.project_name
        : (body.projectName ?? "")
    ).trim();
    const reportContent =
      typeof body.report_content === "string"
        ? body.report_content
        : (body.reportContent ?? "");

    if (!evaluationTypeName || !projectName || !reportContent.trim()) {
      return NextResponse.json(
        {
          error:
            "evaluationTypeName, projectName y reportContent son obligatorios",
        },
        { status: 400 }
      );
    }

    const evaluationTypeIdRaw =
      body.evaluation_type_id ?? body.evaluationTypeId ?? null;
    const evaluationTypeIdCandidate =
      typeof evaluationTypeIdRaw === "number" && Number.isFinite(evaluationTypeIdRaw)
        ? evaluationTypeIdRaw
        : null;

    const evaluationTypeId = await resolveHistoryEvaluationTypeId(
      evaluationTypeIdCandidate,
      evaluationTypeName
    );

    const fileName =
      typeof body.file_name === "string" ? body.file_name : (body.fileName ?? "");

    const subdimensionScores =
      body.subdimension_scores ?? body.subdimensionScores ?? {};

    let overallScore = body.overall_score ?? body.overallScore ?? null;

    const summary = typeof body.summary === "string" ? body.summary : "";

    let scoreSchema = body.score_schema ?? body.scoreSchema ?? [];

    // TRL: recuperar nivel desde el informe si el cliente envió scores null
    if (isTrl(evaluationTypeName)) {
      const recovered = ensureTrlScoresFromText({
        reportOrDraft: reportContent,
        subdimensionScores:
          subdimensionScores && typeof subdimensionScores === "object"
            ? (subdimensionScores as Record<string, number | null>)
            : {},
        overallScore:
          typeof overallScore === "number" && Number.isFinite(overallScore)
            ? overallScore
            : null,
      });
      overallScore = recovered.overallScore;
      if (
        !Array.isArray(scoreSchema) ||
        scoreSchema.length === 0 ||
        !scoreSchema.some((e: RubricScoreSchemaEntry) => e?.key === TRL_LEVEL_SCORE_KEY)
      ) {
        scoreSchema = [
          {
            dimension: "TRL",
            name: TRL_LEVEL_SCORE_NAME,
            weight: null,
            key: TRL_LEVEL_SCORE_KEY,
          },
        ];
      }
      const row = await createEvaluationHistory({
        evaluation_type_id: evaluationTypeId,
        evaluation_type_name: evaluationTypeName,
        project_name: projectName,
        file_name: fileName,
        report_content: reportContent,
        subdimension_scores: recovered.subdimensionScores,
        overall_score: recovered.overallScore,
        summary,
        score_schema: Array.isArray(scoreSchema) ? scoreSchema : [],
      });
      return NextResponse.json(row, { status: 201 });
    }

    const row = await createEvaluationHistory({
      evaluation_type_id: evaluationTypeId,
      evaluation_type_name: evaluationTypeName,
      project_name: projectName,
      file_name: fileName,
      report_content: reportContent,
      subdimension_scores:
        subdimensionScores && typeof subdimensionScores === "object"
          ? subdimensionScores
          : {},
      overall_score:
        typeof overallScore === "number" && Number.isFinite(overallScore)
          ? overallScore
          : null,
      summary,
      score_schema: Array.isArray(scoreSchema) ? scoreSchema : [],
    });

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
