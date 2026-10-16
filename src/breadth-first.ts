import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import type { MutationFunction, MutationResult, TraverseOptions } from "./index";
import { copyContainer, discoverChildren, writeChild } from "./children";
import { reconnectReferences } from "./references";
import { jsonPathStringify, jsonPointerStringify, PathSegment } from "./utils";

interface Entry {
  source: JSONSchema;
  result: JSONSchema;
  ownedContainers: WeakSet<object>;
}

interface Task {
  entry: Entry;
  path: PathSegment[];
  parent?: Entry;
  childPath: PathSegment[];
  additionalPaths: PathSegment[][];
  rootCycle: boolean;
}

const isObjectSchema = (node: JSONSchema): node is JSONSchemaObject =>
  typeof node === "object" && !(node instanceof Boolean);

/** Process one level at a time, yielding async callbacks to the shared driver. */
export function* breadthFirst(
  schema: JSONSchema,
  mutation: MutationFunction,
  opts: TraverseOptions,
): Generator<MutationResult, JSONSchema, JSONSchema | void> {
  const stringify = opts.pathFormat === "jsonpointer" ? jsonPointerStringify : jsonPathStringify;
  const root: Entry = { source: schema, result: schema, ownedContainers: new WeakSet() };
  const entries = new Map<JSONSchema, Entry>();
  if (isObjectSchema(schema)) entries.set(schema, root);
  const queue: Task[] = [{ entry: root, path: [], childPath: [], additionalPaths: [], rootCycle: false }];
  const replacements = new Map<JSONSchema, JSONSchema>();
  const locations = new Map<JSONSchema, PathSegment[][]>();
  let rootMutationScheduled = opts.skipFirstMutation !== true;

  for (let cursor = 0; cursor < queue.length; cursor++) {
    const task = queue[cursor];
    const { entry, parent } = task;
    // A skipped cyclic root may become a boolean after some children were queued.
    if (parent && !isObjectSchema(parent.result)) continue;
    const previous = entry.result;
    let node = task.rootCycle ? previous :
      isObjectSchema(entry.source) && opts.mutable === false ? copyContainer(entry.source) : entry.source;
    if (task.rootCycle || entry !== root || opts.skipFirstMutation !== true) {
      const result = yield mutation(node, task.rootCycle, stringify(task.path), parent?.result as JSONSchema);
      if (result === undefined) {
        if (opts.allowUndefinedReturn !== true) {
          throw new TypeError(`Traversal callback returned undefined at ${stringify(task.path)}; return a schema or set allowUndefinedReturn: true.`);
        }
      } else {
        node = result;
      }
    }
    entry.result = node;
    if (isObjectSchema(previous) && previous !== node) replacements.set(previous, node);
    if (isObjectSchema(entry.source)) {
      if (entry.source !== node) replacements.set(entry.source, node);
      else replacements.delete(entry.source);
    }
    if (task.rootCycle) locations.set(node, locations.get(previous) as PathSegment[][]);
    if (parent && isObjectSchema(parent.result)) {
      writeChild(parent.result, task.childPath, node, opts.mutable !== true || parent.result !== parent.source,
        parent.ownedContainers, parent.source as JSONSchemaObject);
    }
    if (!isObjectSchema(node) || !isObjectSchema(entry.source) || task.rootCycle) continue;

    const children = discoverChildren(entry.source as JSONSchemaObject, opts.additionalSubschemas, task.additionalPaths, task.path, stringify);
    locations.set(node, children.map(child => child.path));
    const ownedContainers = entry.ownedContainers;
    // Keep the existing copy behavior, including empty built-in containers.
    for (const keyword of ["anyOf", "allOf", "oneOf", "items", "properties", "patternProperties"]) {
      const container = (entry.source as JSONSchemaObject)[keyword];
      if (Array.isArray(container) ||
        ((keyword === "properties" || keyword === "patternProperties") && container !== undefined)) {
        node[keyword] = copyContainer(container);
        ownedContainers.add(node[keyword]);
      }
    }
    for (const child of children) {
      const path = [...task.path, ...child.path];
      const existing = isObjectSchema(child.schema) ? entries.get(child.schema) : undefined;
      const childEntry = existing || { source: child.schema, result: child.schema, ownedContainers: new WeakSet<object>() };
      if (!existing) {
        if (isObjectSchema(child.schema)) entries.set(child.schema, childEntry);
        queue.push({ entry: childEntry, parent: entry, childPath: child.path,
          path, additionalPaths: child.additionalPaths, rootCycle: false });
      } else if (existing === root && !rootMutationScheduled) {
        rootMutationScheduled = true;
        queue.push({ entry: root, parent: entry, childPath: child.path,
          path, additionalPaths: [], rootCycle: true });
      }
      writeChild(node, child.path, childEntry.result,
        opts.mutable !== true || node !== entry.source, ownedContainers, entry.source as JSONSchemaObject);
    }
  }
  return reconnectReferences(root.result, replacements, locations);
}
