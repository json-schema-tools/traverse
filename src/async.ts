import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import type { MutationFunction, MutationResult } from "./index";

const isAsync = (value: MutationResult): value is PromiseLike<JSONSchema | void> =>
  value !== null && (typeof value === "object" || typeof value === "function") &&
  typeof (value as { then?: unknown }).then === "function";

const isObjectSchema = (schema: JSONSchema | void): schema is JSONSchemaObject =>
  schema !== null && typeof schema === "object" && !(schema instanceof Boolean);

/** Drive one traversal synchronously until a callback yields asynchronous work. */
export function runTraversal(
  iterator: Generator<MutationResult, JSONSchema, JSONSchema | void>,
): JSONSchema | Promise<JSONSchema> {
  const advance = (step: IteratorResult<MutationResult, JSONSchema>): JSONSchema | Promise<JSONSchema> => {
    while (!step.done) {
      const value = step.value;
      if (isAsync(value)) {
        return Promise.resolve(value).then(resolved => advance(iterator.next(resolved)));
      }
      step = iterator.next(value as JSONSchema | void);
    }
    return step.value;
  };
  return advance(iterator.next());
}

/** Merge object patches into the working node after synchronous or async callbacks. */
export function withMerge(mutation: MutationFunction): MutationFunction {
  return (node, isCycle, path, parent) => {
    const merge = (result: JSONSchema | void): JSONSchema | void => {
      if (isObjectSchema(node) && isObjectSchema(result)) {
        Object.keys(result).forEach(key => Object.defineProperty(node, key, {
          value: result[key], enumerable: true, configurable: true, writable: true,
        }));
        return node;
      }
      return result;
    };
    const result = mutation(node, isCycle, path, parent);
    return isAsync(result) ? Promise.resolve(result).then(merge) : merge(result);
  };
}
