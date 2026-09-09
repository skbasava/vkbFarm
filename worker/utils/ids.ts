/** Creates a cryptographically strong identifier for application records. */
export function createId(): string {
  return crypto.randomUUID();
}
