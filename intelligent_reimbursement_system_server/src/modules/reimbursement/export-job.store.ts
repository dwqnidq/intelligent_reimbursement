import { randomUUID } from 'node:crypto';

interface ExportJob {
  buffer: Buffer;
  filename: string;
  expiresAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const jobs = new Map<string, ExportJob>();

function purgeExpired() {
  const now = Date.now();
  for (const [token, job] of jobs) {
    if (now > job.expiresAt) jobs.delete(token);
  }
}

export function putExportJob(buffer: Buffer, filename: string): string {
  purgeExpired();
  const token = randomUUID();
  jobs.set(token, {
    buffer,
    filename,
    expiresAt: Date.now() + TTL_MS,
  });
  return token;
}

export function takeExportJob(
  token: string,
): { buffer: Buffer; filename: string } | null {
  purgeExpired();
  const job = jobs.get(token);
  if (!job || Date.now() > job.expiresAt) {
    jobs.delete(token);
    return null;
  }
  jobs.delete(token);
  return { buffer: job.buffer, filename: job.filename };
}
