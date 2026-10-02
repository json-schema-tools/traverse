import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

/** Reconnect back-references after callbacks replace objects still being visited. */
export function reconnectReferences(
  root: JSONSchema,
  replacements: Map<JSONSchema, JSONSchema>,
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
    for (const keyword of ["anyOf", "allOf", "oneOf", "items"]) {
      const children = object[keyword];
      if (Array.isArray(children)) {
        const updated = children.map(reconnect);
        if (updated.some((child, index) => child !== children[index])) {
          object[keyword] = updated;
        }
      }
    }

    for (const keyword of [
      "items", "additionalItems", "contains", "unevaluatedItems",
      "additionalProperties", "propertyNames", "unevaluatedProperties",
    ]) {
      const child = object[keyword];
      if (child !== undefined && !Array.isArray(child)) {
        const updated = reconnect(child);
        if (updated !== child) {
          object[keyword] = updated;
        }
      }
    }

    for (const keyword of ["properties", "patternProperties"]) {
      const children = object[keyword];
      if (children !== undefined) {
        let updated = children;
        for (const key of Object.keys(children)) {
          const child = reconnect(children[key]);
          if (child !== children[key]) {
            // A replacement can share this container with the input object.
            // Copy the container before redirecting one of its references.
            if (updated === children) {
              updated = { ...children };
            }
            Object.defineProperty(updated, key, {
              value: child, enumerable: true, configurable: true, writable: true,
            });
          }
        }
        if (updated !== children) {
          object[keyword] = updated;
        }
      }
    }
    return node;
  };

  return reconnect(root);
}
