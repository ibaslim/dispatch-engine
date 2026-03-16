/**
 * Generate TypeScript types from FastAPI OpenAPI schema.
 *
 * Usage:
 *   ts-node libs/shared/contracts/scripts/generate.ts
 *
 * Requires the API to be running at API_BASE_URL, or reads from a local
 * openapi.json file if OPENAPI_SPEC_PATH is set.
 *
 * Delegates to `openapi-typescript` under the hood.
 */

import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:8000';
const OPENAPI_SPEC_PATH = process.env['OPENAPI_SPEC_PATH'];
const OUTPUT_FILE = path.resolve(
  __dirname,
  '../src/generated/api-schema.ts'
);

const outputDir = path.dirname(OUTPUT_FILE);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const source = OPENAPI_SPEC_PATH ?? `${API_BASE_URL}/openapi.json`;

console.log(`Generating TS types from: ${source}`);
console.log(`Output: ${OUTPUT_FILE}`);

execSync(
  `npx openapi-typescript "${source}" --output "${OUTPUT_FILE}"`,
  { stdio: 'inherit' }
);

console.log('Contract generation complete.');
