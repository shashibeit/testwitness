import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import JSZip from 'jszip';

import { EvidenceExporter } from '../dist/index.js';
import { createReportPreviewFixture } from './report-preview-fixture.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactsDirectory = path.join(projectRoot, '.artifacts');
const previewDirectory = path.join(artifactsDirectory, 'report-preview');

function safeOutputPath(entryName) {
  const destination = path.resolve(previewDirectory, entryName);
  const expectedPrefix = `${path.resolve(previewDirectory)}${path.sep}`;
  if (!destination.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to extract an unsafe ZIP entry: ${entryName}`);
  }
  return destination;
}

async function extractArchive(archive) {
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const files = Object.values(zip.files).filter((entry) => !entry.dir);

  for (const entry of files) {
    const destination = safeOutputPath(entry.name);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, await entry.async('uint8array'));
  }
  return files.map((entry) => entry.name).sort();
}

async function main() {
  const { evidence, summary } = createReportPreviewFixture();
  const exporter = new EvidenceExporter({
    fileNamePattern: 'TestWitness-{testCaseId}-{timestamp}.zip',
    includeHtmlReport: true,
    includeJsonReport: true,
  });

  const result = await exporter.generate(evidence, summary);
  await rm(previewDirectory, { recursive: true, force: true });
  await mkdir(previewDirectory, { recursive: true });
  const extractedFiles = await extractArchive(result.blob);

  const reportPath = path.join(previewDirectory, 'report.html');
  const reportHtml = await zipReport(result.blob);
  await writeFile(path.join(previewDirectory, 'index.html'), reportHtml, 'utf8');
  await mkdir(artifactsDirectory, { recursive: true });
  const archivePath = path.join(artifactsDirectory, result.fileName);
  await writeFile(archivePath, new Uint8Array(await result.blob.arrayBuffer()));

  process.stdout.write(
    [
      'TestWitness report preview generated.',
      `Report: ${reportPath}`,
      `Archive: ${archivePath}`,
      `Files: ${extractedFiles.length}`,
      'Serve: npm run report:preview',
      'URL: http://127.0.0.1:4175/',
      '',
    ].join('\n'),
  );
}

async function zipReport(archive) {
  const zip = await JSZip.loadAsync(await archive.arrayBuffer());
  const report = zip.file('report.html');
  if (!report) throw new Error('The generated evidence archive does not contain report.html.');
  return await report.async('string');
}

await main();
