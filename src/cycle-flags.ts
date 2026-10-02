import { JSONSchema } from "@json-schema-tools/meta-schema";
import type { MutationFunction, TraverseOptions } from "./index";
import { builtInChildren, readChild } from "./children";
import { PathSegment } from "./utils";

// Capture a dot member name, or a bracketed index / JSON-quoted member name.
const JSON_PATH_SEGMENT_PATTERN = /\.([A-Za-z_][A-Za-z0-9_]*)|\[(\d+|"(?:[^"\\]|\\.)*")\]/g;

function parseJsonPath(path: string): PathSegment[] {
  const segments: PathSegment[] = [];

  for (const match of path.matchAll(JSON_PATH_SEGMENT_PATTERN)) {
    const [, memberName, bracketValue] = match;
    if (memberName !== undefined) {
      segments.push(memberName);
    } else {
      // JSON.parse decodes both numeric indices and escaped string names.
      segments.push(JSON.parse(bracketValue) as PathSegment);
    }
  }

  return segments;
}

function parseJsonPointer(path: string): PathSegment[] {
  const encodedSegments = path.split("/").slice(1);
  return encodedSegments.map(segment => {
    // Decode escaped slashes first so ~01 becomes ~1, rather than a slash.
    return segment.replace(/~1/g, "/").replace(/~0/g, "~");
  });
}

function findCycleRoots(schema: JSONSchema): Set<JSONSchema> {
  const cycleRoots = new Set<JSONSchema>();
  const activeAncestors = new Set<JSONSchema>();
  const visitedSchemas = new Set<JSONSchema>();

  const discover = (node: JSONSchema): void => {
    if (typeof node !== "object" || node instanceof Boolean) {
      return;
    }
    if (activeAncestors.has(node)) {
      cycleRoots.add(node);
      return;
    }
    if (visitedSchemas.has(node)) {
      return;
    }

    visitedSchemas.add(node);
    activeAncestors.add(node);
    for (const child of builtInChildren(node)) {
      discover(child.schema);
    }
    activeAncestors.delete(node);
  };

  discover(schema);
  return cycleRoots;
}

/** Discover back-reference targets before callbacks can replace the input graph. */
export function withCycleFlags(
  schema: JSONSchema,
  mutation: MutationFunction,
  opts: TraverseOptions,
): MutationFunction {
  const cycleRoots = findCycleRoots(schema);

  return (node, isCycle, path, parent) => {
    let pathSegments: PathSegment[];
    if (opts.pathFormat === "jsonpointer") {
      pathSegments = parseJsonPointer(path);
    } else {
      pathSegments = parseJsonPath(path);
    }

    const inputNode = readChild(schema, pathSegments) as JSONSchema;
    const isInputCycleRoot = cycleRoots.has(inputNode);
    const callbackIsCycle = isCycle || isInputCycleRoot;

    return mutation(node, callbackIsCycle, path, parent);
  };
}
