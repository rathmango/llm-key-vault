import crypto from "crypto";

const ENVELOPE_PREFIX = "v1";

function getKey(): Buffer {
  const b64 = process.env.LLMKV_ENCRYPTION_KEY;
  if (!b64) throw new Error("Missing LLMKV_ENCRYPTION_KEY");

  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error(
      `LLMKV_ENCRYPTION_KEY must be 32 bytes (base64). Got ${key.length} bytes.`
    );
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENVELOPE_PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

export function decryptSecret(envelope: string): string {
  const [prefix, ivB64, tagB64, ctB64] = envelope.split(":");
  if (prefix !== ENVELOPE_PREFIX || !ivB64 || !tagB64 || !ctB64) {
    throw new Error("Invalid secret envelope format");
  }

  const key = getKey();
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ciphertext = Buffer.from(ctB64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");

  return plaintext;
}
