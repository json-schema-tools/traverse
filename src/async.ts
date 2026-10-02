import { JSONSchema } from "@json-schema-tools/meta-schema";
import type { MutationResult } from "./index";

/** Drive one traversal synchronously until a callback yields asynchronous work. */
export function runTraversal(
  iterator: Generator<MutationResult, JSONSchema, JSONSchema | void>,
): JSONSchema | Promise<JSONSchema> {
  const advance = (step: IteratorResult<MutationResult, JSONSchema>): JSONSchema | Promise<JSONSchema> => {
    while (!step.done) {
      const value = step.value;
      if (value !== null && (typeof value === "object" || typeof value === "function") &&
        typeof (value as { then?: unknown }).then === "function") {
        return Promise.resolve(value).then(resolved => advance(iterator.next(resolved)));
      }
      step = iterator.next(value as JSONSchema | void);
    }
    return step.value;
  };
  return advance(iterator.next());
}
