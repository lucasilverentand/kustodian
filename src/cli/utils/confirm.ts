import { createInterface } from 'node:readline';

/**
 * Prompts the user for confirmation (y/N).
 * Returns true if the user enters 'y' or 'Y', false otherwise.
 */
export async function confirm(message: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y');
    });
  });
}
