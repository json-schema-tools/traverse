import { JSONSchema } from "@json-schema-tools/meta-schema";
import type { MutationFunction, TraverseOptions } from "./index";
import { builtInChildren, readChild } from "./children";
import { PathSegment } from "./utils";

/** Discover back-reference targets before callbacks can replace the input graph. */
export function withCycleFlags(schema: JSONSchema, mutation: MutationFunction, opts: TraverseOptions): MutationFunction {
  const roots = new Set<JSONSchema>();
  const active = new Set<JSONSchema>();
  const visited = new Set<JSONSchema>();
  const discover = (node: JSONSchema) => {
    if (typeof node !== "object" || node instanceof Boolean) return;
    if (active.has(node)) {
      roots.add(node);
      return;
    }
    if (visited.has(node)) return;
    visited.add(node);
    active.add(node);
    builtInChildren(node).forEach(child => discover(child.schema));
    active.delete(node);
  };
  discover(schema);

  return (node, isCycle, path, parent) => {
    const segments: PathSegment[] = opts.pathFormat === "jsonpointer" ?
      path.split("/").slice(1).map(segment => segment.replace(/~1/g, "/").replace(/~0/g, "~")) :
      Array.from(path.matchAll(/\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+|"(?:[^"\\]|\\.)*")\]/g), match =>
        match[1] ?? JSON.parse(match[2]) as PathSegment);
    return mutation(node, isCycle || roots.has(readChild(schema, segments) as JSONSchema), path, parent);
  };
}
