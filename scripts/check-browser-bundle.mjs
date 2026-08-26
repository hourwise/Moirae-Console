/* global console, process */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const repositoryRoot = process.cwd();
const distRoot = join(repositoryRoot, 'dist');
const protectedCanary = 'MC01-PROTECTED-DOCUMENT-CANARY-9f4c2d7a';
const forbidden = [
  { label: 'protected document canary', pattern: protectedCanary },
  { label: 'private-key marker', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { label: 'Windows user path', pattern: /[DC]:\\Users\\/ },
  { label: 'server-only fixture path', pattern: 'demo-policy-001.txt' },
  { label: 'server-only publication target', pattern: 'moirae-demo-publication-slot.v1.bin' },
  { label: 'execution credential name', pattern: 'ANANKE_MOIRAE_EXECUTION_TOKEN' },
  { label: 'publication credential name', pattern: 'ANANKE_MOIRAE_PUBLISH_TOKEN' },
  { label: 'approver credential name', pattern: 'ANANKE_MOIRAE_APPROVER_TOKEN' },
  { label: 'restricted credential name', pattern: 'ANANKE_MOIRAE_RESTRICTED_TOKEN' },
  { label: 'operator step-up secret name', pattern: 'MOIRAE_OPERATOR_STEP_UP_SECRET' },
  { label: 'server-only source marker', pattern: 'FixedDemoDocumentSource' },
  { label: 'Node filesystem import', pattern: 'node:fs' },
];

if (!existsSync(distRoot)) {
  console.error('Browser bundle inspection failed: dist/ does not exist.');
  process.exit(1);
}

const files = collectTextFiles(distRoot);
const findings = [];
for (const file of files) {
  const content = readFileSync(file, 'utf8');
  for (const item of forbidden) {
    const matches =
      typeof item.pattern === 'string'
        ? content.includes(item.pattern)
        : item.pattern.test(content);
    if (matches) {
      findings.push(`${item.label} in ${file.replace(repositoryRoot, '')}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Browser bundle inspection failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Browser bundle inspection passed: ${files.length} delivered text files checked.`);

function collectTextFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...collectTextFiles(path));
    } else if (/\.(html|css|js|map)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
