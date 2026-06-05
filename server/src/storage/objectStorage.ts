import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

export type PutImageInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type StoredImage = {
  key: string;
  url: string;
};

export interface ObjectStorage {
  putImage(input: PutImageInput): Promise<StoredImage>;
}

export class MemoryObjectStorage implements ObjectStorage {
  private readonly files = new Map<string, { body: Buffer; contentType: string }>();

  constructor(private readonly publicBaseUrl = "/uploads") {}

  async putImage(input: PutImageInput): Promise<StoredImage> {
    this.files.set(input.key, { body: input.body, contentType: input.contentType });
    return {
      key: input.key,
      url: `${this.publicBaseUrl.replace(/\/$/, "")}/${input.key}`
    };
  }

  get(key: string): { body: Buffer; contentType: string } | undefined {
    return this.files.get(key);
  }
}

export class S3ObjectStorage implements ObjectStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly publicBaseUrl: string
  ) {}

  async putImage(input: PutImageInput): Promise<StoredImage> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
        CacheControl: "public, max-age=31536000, immutable"
      })
    );

    return {
      key: input.key,
      url: `${this.publicBaseUrl.replace(/\/$/, "")}/${input.key}`
    };
  }
}
