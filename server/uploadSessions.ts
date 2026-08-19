import { acceptedMediaTypes } from "./projects";
import { storagePut } from "./storage";

const MAX_MEDIA_BYTES = 25 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 48 * 1024;
const SESSION_TTL_MS = 20 * 60 * 1000;

type UploadSession = {
  userId: number;
  name: string;
  type: string;
  totalBytes: number;
  receivedBytes: number;
  chunks: Buffer[];
  createdAt: number;
};

const sessions = new Map<string, UploadSession>();

function cleanExpiredSessions() {
  const threshold = Date.now() - SESSION_TTL_MS;
  sessions.forEach((session, id) => {
    if (session.createdAt < threshold) sessions.delete(id);
  });
}

function safeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-").slice(0, 180) || "property-media";
}

function getOwnedSession(userId: number, uploadId: string) {
  const session = sessions.get(uploadId);
  if (!session || session.userId !== userId) throw new Error("This upload session has expired. Please select the file again.");
  return session;
}

export function createUploadSession(userId: number, name: string, type: string, totalBytes: number) {
  cleanExpiredSessions();
  if (!acceptedMediaTypes.includes(type as (typeof acceptedMediaTypes)[number])) {
    throw new Error("Use JPG, PNG, WEBP, MP4, or MOV media files.");
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 1 || totalBytes > MAX_MEDIA_BYTES) {
    throw new Error("Keep the combined upload size under 25 MB.");
  }
  const id = crypto.randomUUID();
  sessions.set(id, { userId, name, type, totalBytes, receivedBytes: 0, chunks: [], createdAt: Date.now() });
  return { id, chunkSize: UPLOAD_CHUNK_BYTES };
}

export function appendUploadChunk(userId: number, uploadId: string, encodedChunk: string) {
  const session = getOwnedSession(userId, uploadId);
  if (!/^[A-Za-z0-9+/=]+$/.test(encodedChunk)) throw new Error("The uploaded media could not be read.");
  const chunk = Buffer.from(encodedChunk, "base64");
  if (chunk.byteLength === 0 || chunk.byteLength > UPLOAD_CHUNK_BYTES) {
    throw new Error("An upload chunk was invalid. Please try again.");
  }
  if (session.receivedBytes + chunk.byteLength > session.totalBytes) {
    throw new Error("The upload size did not match the selected file.");
  }
  session.chunks.push(chunk);
  session.receivedBytes += chunk.byteLength;
  return { receivedBytes: session.receivedBytes, totalBytes: session.totalBytes };
}

export async function finalizeUploadSession(userId: number, uploadId: string) {
  const session = getOwnedSession(userId, uploadId);
  if (session.receivedBytes !== session.totalBytes) {
    throw new Error("The upload is incomplete. Please try again.");
  }
  sessions.delete(uploadId);
  const asset = await storagePut(
    `property-projects/${userId}/${Date.now()}-${safeFileName(session.name)}`,
    Buffer.concat(session.chunks, session.totalBytes),
    session.type,
  );
  return { name: session.name, type: session.type, key: asset.key, url: asset.url };
}
