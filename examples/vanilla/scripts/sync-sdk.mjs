import { copyFile, mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const destinationDirectory = fileURLToPath(new URL('../public/vendor/', import.meta.url));
await mkdir(destinationDirectory, { recursive: true });

for (const fileName of ['testwitness.min.js', 'testwitness.min.js.map']) {
  const source = fileURLToPath(new URL(`../../../dist/${fileName}`, import.meta.url));
  const destination = fileURLToPath(new URL(`../public/vendor/${fileName}`, import.meta.url));
  let sourceStats;
  try {
    sourceStats = await stat(source);
  } catch (error) {
    throw new Error(
      `The TestWitness browser asset "${fileName}" is missing. Run \`npm run sdk:build\` first.`,
      { cause: error },
    );
  }

  if (!sourceStats.isFile() || sourceStats.size === 0) {
    throw new Error(`The TestWitness browser asset "${fileName}" is empty or is not a file.`);
  }

  await copyFile(source, destination);
  console.log(`Copied ${fileName} (${sourceStats.size} bytes).`);
}
