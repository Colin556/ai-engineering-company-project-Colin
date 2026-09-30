/** Mirrors the API rules: 8+ characters and at most 72 bytes (bcrypt limit). */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters.";
  if (new TextEncoder().encode(password).length > 72) {
    return "Password must be at most 72 bytes.";
  }
  if (password !== confirmation) return "Passwords do not match.";
  return null;
}
