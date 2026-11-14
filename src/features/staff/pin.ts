import { randomInt } from "node:crypto";

const WEAK_SEQUENCES = new Set([
  "0123",
  "1234",
  "2345",
  "3456",
  "4567",
  "5678",
  "6789",
  "9876",
  "8765",
  "7654",
  "6543",
  "5432",
  "4321",
  "3210",
]);

/**
 * Checks whether a 4-digit PIN is trivially guessable (all identical digits
 * such as "0000"/"1111" or consecutive ascending/descending sequences).
 */
export function isWeakStaffPin(pin: string): boolean {
  if (!/^\d{4}$/.test(pin)) {
    return true;
  }
  if (/^(\d)\1{3}$/.test(pin)) {
    return true;
  }
  return WEAK_SEQUENCES.has(pin);
}

/**
 * Generates a cryptographically random 4-digit kitchen staff PIN, avoiding
 * repeated digits and trivial ascending/descending sequences.
 */
export function generateStaffPin(
  randomInteger: (min: number, max: number) => number = randomInt,
): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = String(randomInteger(0, 10_000)).padStart(4, "0");
    if (!isWeakStaffPin(candidate)) {
      return candidate;
    }
  }
  return String(randomInteger(1000, 9999));
}
