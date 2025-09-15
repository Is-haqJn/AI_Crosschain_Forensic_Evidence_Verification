// Modern Node.js loader using register() API instead of experimental --loader
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register ts-node/esm for TypeScript ES modules support
register('ts-node/esm', pathToFileURL('./'));