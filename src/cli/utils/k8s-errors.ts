/**
 * Checks if an error message indicates a Kubernetes "not found" error.
 *
 * Matches kubectl-style errors:
 * - `Error from server (NotFound): secrets "foo" not found`
 * - `secrets "foo" not found`
 *
 * Rejects unrelated messages like:
 * - `config file not found on disk, retrying`
 */
export function is_not_found_error(message: string): boolean {
  // kubectl format: Error from server (NotFound): ...
  if (/\(NotFound\)/.test(message)) {
    return true;
  }
  // Trailing "not found" at end of line (resource-style messages)
  if (/not found$/im.test(message)) {
    return true;
  }
  return false;
}
