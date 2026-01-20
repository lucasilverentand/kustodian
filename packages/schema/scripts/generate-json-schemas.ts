#!/usr/bin/env bun

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  cluster_schema,
  node_profile_resource_schema,
  node_resource_schema,
  template_schema,
} from '../src/index.js';

const SCHEMAS_DIR = join(import.meta.dir, '..', 'schemas');

const schemas = [
  {
    name: 'template',
    schema: template_schema,
    description: 'Kustodian Template resource schema',
    title: 'Template',
  },
  {
    name: 'cluster',
    schema: cluster_schema,
    description: 'Kustodian Cluster resource schema',
    title: 'Cluster',
  },
  {
    name: 'node',
    schema: node_resource_schema,
    description: 'Kustodian Node resource schema (individual node definitions)',
    title: 'Node',
  },
  {
    name: 'node-profile',
    schema: node_profile_resource_schema,
    description: 'Kustodian NodeProfile resource schema',
    title: 'NodeProfile',
  },
];

mkdirSync(SCHEMAS_DIR, { recursive: true });

for (const { name, schema, description, title } of schemas) {
  const jsonSchema = zodToJsonSchema(schema, {
    name: title,
    $refStrategy: 'none',
    target: 'jsonSchema7',
    definitions: {},
    errorMessages: true,
    markdownDescription: true,
  });

  // Add schema metadata
  const schemaWithMetadata = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: `https://kustodian.io/schemas/${name}.json`,
    ...jsonSchema,
    description,
  };

  const outputPath = join(SCHEMAS_DIR, `${name}.json`);
  writeFileSync(outputPath, JSON.stringify(schemaWithMetadata, null, 2));

  console.log(`✓ Generated ${name}.json`);
}

console.log(`\n✓ All schemas generated in ${SCHEMAS_DIR}`);
