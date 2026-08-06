import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import {
  canLegacyClientBlobUpload,
  useBlobStorage,
} from "@/lib/blob-storage";
import {
  KNOWLEDGE_CONTENT_TYPES,
  validateKnowledgeUploadPath,
} from "@/lib/upload-client-auth";
import { clientErrorMessage, logServerError } from "@/lib/api-errors";

export const maxDuration = 60;

const UPLOAD_TOKEN_OPTS = {
  allowedContentTypes: KNOWLEDGE_CONTENT_TYPES,
  maximumSizeInBytes: 50 * 1024 * 1024,
  addRandomSuffix: true,
} as const;

async function onBeforeGenerateToken(pathname: string, clientPayload: string | null) {
  await validateKnowledgeUploadPath(pathname, clientPayload);
  return {
    ...UPLOAD_TOKEN_OPTS,
    tokenPayload: clientPayload,
  };
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!useBlobStorage()) {
    return NextResponse.json({ error: "Blob storage no configurado" }, { status: 400 });
  }
  if (!canLegacyClientBlobUpload()) {
    return NextResponse.json(
      {
        error:
          "Falta BLOB_READ_WRITE_TOKEN para subidas grandes desde el cliente. Añádelo en .env.local o usa vercel env pull.",
      },
      { status: 503 }
    );
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken,
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    logServerError("upload/client", error);
    return NextResponse.json({ error: clientErrorMessage(error) }, { status: 400 });
  }
}
