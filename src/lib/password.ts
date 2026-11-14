import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export function hashSecret(secret: string): string {
  return bcrypt.hashSync(secret, BCRYPT_ROUNDS);
}

export function verifySecret(secret: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.startsWith("$2")) {
    return false;
  }
  return bcrypt.compareSync(secret, storedHash);
}
