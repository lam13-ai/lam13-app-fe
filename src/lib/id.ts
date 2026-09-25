/** Client-generated id (used for optimistic items and client_message_id). */
export function createId(): string {
  return crypto.randomUUID();
}
