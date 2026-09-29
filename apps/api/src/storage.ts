import { err, ok, type Result } from "@myma/types";

export interface StorageUpload {
  url: string;
  headers: Record<string, string>;
}

export interface StorageService {
  createUploadUrl(key: string): Promise<Result<StorageUpload>>;
  createDownloadUrl(key: string): Promise<Result<string>>;
}

/**
 * Minimal R2-backed storage service.
 *
 * NOTE: This is intentionally surface-level. R2's in-Worker binding does not
 * expose presigned URLs, so the production path creates a multipart upload
 * and returns an S3-compatible placeholder URL. A real deployment should swap
 * this for AWS Signature v4 presigned URLs using R2 S3 credentials.
 */
export class R2StorageService implements StorageService {
  constructor(private readonly env: { BACKUPS: R2Bucket }) {}

  async createUploadUrl(key: string): Promise<Result<StorageUpload>> {
    try {
      const upload = await this.env.BACKUPS.createMultipartUpload(key);
      const url = new URL(`https://r2.example.com/${key}`);
      url.searchParams.set("uploadId", upload.uploadId);
      return ok({ url: url.toString(), headers: {} });
    } catch (e) {
      return err("INTERNAL_ERROR", e instanceof Error ? e.message : String(e));
    }
  }

  async createDownloadUrl(key: string): Promise<Result<string>> {
    // Placeholder: replace with presigned GET URL in production.
    return ok(`https://r2.example.com/${key}`);
  }
}

export class FakeStorageService implements StorageService {
  uploads: Map<string, StorageUpload> = new Map();

  async createUploadUrl(key: string): Promise<Result<StorageUpload>> {
    const upload: StorageUpload = { url: `https://fake-storage.example.com/${key}`, headers: {} };
    this.uploads.set(key, upload);
    return ok(upload);
  }

  async createDownloadUrl(key: string): Promise<Result<string>> {
    return ok(`https://fake-storage.example.com/${key}`);
  }
}
