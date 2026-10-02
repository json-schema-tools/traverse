import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import { builtInChildren, ChildLocations, readChild, writeChild } from "./children";

/** Reconnect back-references after callbacks replace objects still being visited. */
export function reconnectReferences(
  root: JSONSchema,
  replacements: Map<JSONSchema, JSONSchema>,
  childLocations: ChildLocations = new Map(),
): JSONSchema {
  if (replacements.size === 0) {
    return root;
  }
  const visited = new Set<JSONSchema>();

  const reconnect = (node: JSONSchema): JSONSchema => {
    const resolving = new Set<JSONSchema>();
    while (replacements.has(node) && !resolving.has(node)) {
      resolving.add(node);
      node = replacements.get(node) as JSONSchema;
    }

    if (typeof node !== "object" || node instanceof Boolean || visited.has(node)) {
      return node;
    }
    visited.add(node);

    const object = node as JSONSchemaObject;
    const paths = [
      ...builtInChildren(object).map(({ path }) => path),
      ...(childLocations.get(node) || []),
    ];
    const seen = new Set<string>();
    const ownedContainers = new WeakSet<object>();
    for (const path of paths) {
      const key = JSON.stringify(path.map(String));
      if (seen.has(key)) continue;
      seen.add(key);
      const child = readChild(object, path);
      // Callbacks may remove a selected location or replace its container.
      if (child === undefined) continue;
      const updated = reconnect(child as JSONSchema);
      if (updated !== child) {
        writeChild(object, path, updated, true, ownedContainers, object);
      }
    }
    return node;
  };

  return reconnect(root);
}
