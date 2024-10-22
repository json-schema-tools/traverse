import { runTest } from "./traverse.tiger.test";
import { JSONSchema } from "@json-schema-tools/meta-schema";
import { TraverseOptions } from "./index";
import Ajv from 'ajv';
import metaSchema from '@json-schema-tools/meta-schema';

const ajv = new Ajv();
ajv.addMetaSchema(metaSchema);

const isValidJSONSchema = (schema: any): boolean => {
  const valid = ajv.validate(metaSchema, schema) as boolean;
  if (!valid) {
    console.error('JSON Schema validation error:', ajv.errorsText());
  }
  return valid;
};

const isValidTraverseOptions = (options: TraverseOptions): boolean => {
  return (
    typeof options.skipFirstMutation === 'boolean' &&
    typeof options.mergeNotMutate === 'boolean' &&
    typeof options.mutable === 'boolean' &&
    typeof options.bfs === 'boolean'
  );
};

const checkMutation = (original: any, mutated: any, path: string, options: TraverseOptions, mutationType: 'inPlace' | 'copy'): boolean => {
  if (options.skipFirstMutation && path === '$') {
    return true;
  }

  const originalValue = getValueAtPath(original, path);
  const mutatedValue = getValueAtPath(mutated, path);

  if (options.mutable) {
    if (mutationType === 'inPlace') {
      return originalValue === mutatedValue && !isEqual(originalValue, mutatedValue);
    } else {
      return originalValue !== mutatedValue;
    }
  } else {
    if (options.mergeNotMutate) {
      if (typeof originalValue === 'object' && originalValue !== null) {
        return Object.keys(mutatedValue).some(key => 
          !Object.prototype.hasOwnProperty.call(originalValue, key) || 
          !isEqual(mutatedValue[key], originalValue[key])
        );
      } else {
        return !isEqual(originalValue, mutatedValue);
      }
    } else {
      return originalValue !== mutatedValue;
    }
  }
};

const fuzz = (iterations: number) => {
  for (let i = 0; i < iterations; i++) {
    const seed = `fuzz-${Date.now()}-${i}`;
    const { schema, result, options, mutatedPaths, mutationTypes } = runTest(seed);

    try {
      expect(isValidJSONSchema(schema)).toBe(true);
      expect(isValidJSONSchema(result)).toBe(true);
      expect(isValidTraverseOptions(options)).toBe(true);

      if (!options.mutable && !options.skipFirstMutation) {
        expect(result).not.toBe(schema);
      }

      mutatedPaths.forEach(path => {
        expect(checkMutation(schema, result, path, options, mutationTypes[path])).toBe(true);
      });
    } catch (error) {
      const errorInfo = {
        seed,
        schema: JSON.stringify(schema, null, 2),
        result: JSON.stringify(result, null, 2),
        options,
        mutatedPaths,
        mutationTypes
      };
      console.error('Error in fuzzing run:', JSON.stringify(errorInfo, null, 2));
      console.error(error);
      throw error;
    }
  }

  console.log(`Successfully completed ${iterations} fuzzing iterations.`);
};

const getValueAtPath = (obj: any, path: string): any => {
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined) return undefined;
    if (part.includes('[') && part.includes(']')) {
      const [arrayName, indexStr] = part.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      current = current[arrayName][index];
    } else {
      current = current[part];
    }
  }
  return current;
};

const isEqual = (a: any, b: any): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const keysA = Object.keys(a), keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (const key of keysA) {
    if (!keysB.includes(key) || !isEqual(a[key], b[key])) return false;
  }
  return true;
};

describe("Fuzz tests", () => {
  it("should run 10,000 fuzz tests with a high success rate", () => {
    fuzz(10000);
  });
});
