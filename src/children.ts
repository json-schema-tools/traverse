import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import { PathSegment } from "./utils";

/** A subschema location relative to the object passed to additionalSubschemas. */
export interface AdditionalSubschema {
  readonly path: readonly PathSegment[];
}

/** Select additional object or boolean schemas without visiting their containers. */
export type AdditionalSubschemas = (node: Readonly<JSONSchemaObject>) => readonly AdditionalSubschema[];

export type ChildLocations = Map<JSONSchema, PathSegment[][]>;

interface Child {
  path: PathSegment[];
  schema: JSONSchema;
  additionalPaths: PathSegment[][];
}

/** Discover built-in locations in the existing traversal order. */
export function builtInChildren(schema: JSONSchemaObject): Child[] {
  const children: Child[] = [];
  const add = (path: PathSegment[], value: JSONSchema) => {
    children.push({ path, schema: value, additionalPaths: [] });
  };
  for (const keyword of ["anyOf", "allOf", "oneOf", "items"]) {
    const value = schema[keyword];
    if (value) {
      if (Array.isArray(value)) {
        value.forEach((child, index) => add([keyword, index], child));
      } else {
        add([keyword], value);
      }
    }
  }
  for (const keyword of ["additionalItems", "contains", "unevaluatedItems"]) {
    if (schema[keyword] !== undefined) {
      add([keyword], schema[keyword]);
    }
  }
  for (const keyword of ["properties", "patternProperties"]) {
    if (schema[keyword] !== undefined) {
      Object.keys(schema[keyword]).forEach(key => add([keyword, key], schema[keyword][key]));
    }
  }
  if (schema.additionalProperties) {
    add(["additionalProperties"], schema.additionalProperties);
  }
  if (schema.propertyNames !== undefined) {
    add(["propertyNames"], schema.propertyNames);
  }
  if (schema.unevaluatedProperties) {
    add(["unevaluatedProperties"], schema.unevaluatedProperties);
  }
  for (const keyword of ["not", "if", "then", "else"]) {
    if (schema[keyword] !== undefined) {
      add([keyword], schema[keyword]);
    }
  }
  for (const keyword of ["definitions", "$defs", "dependencies", "dependentSchemas"]) {
    if (schema[keyword] !== undefined) {
      Object.keys(schema[keyword]).forEach(key => {
        const value = schema[keyword][key];
        // Legacy dependencies also permits arrays of property names, which are data.
        if (keyword !== "dependencies" || !Array.isArray(value)) {
          add([keyword, key], value);
        }
      });
    }
  }
  if (schema.prefixItems !== undefined) {
    schema.prefixItems.forEach((child: JSONSchema, index: number) => add(["prefixItems", index], child));
  }
  return children;
}

type Container = Record<string, unknown>;
const isContainer = (value: unknown): value is Container => value !== null && typeof value === "object";

/** Read only own properties, so selections cannot walk through object prototypes. */
export function readChild(root: unknown, path: readonly PathSegment[]): unknown {
  let value = root;
  for (const segment of path) {
    if (!isContainer(value) || !Object.prototype.hasOwnProperty.call(value, segment)) {
      return undefined;
    }
    value = value[String(segment)];
  }
  return value;
}

export function copyContainer(container: Container): Container {
  if (Array.isArray(container)) return container.slice() as unknown as Container;
  const copy: Container = {};
  Object.keys(container).forEach(key => Object.defineProperty(copy, key, {
    value: container[key], enumerable: true, configurable: true, writable: true,
  }));
  return copy;
}

/** Copy intermediate containers before writing a replacement in immutable mode. */
export function writeChild(
  root: JSONSchemaObject,
  path: readonly PathSegment[],
  value: JSONSchema,
  copy: boolean,
  ownedContainers: WeakSet<object>,
  source: JSONSchemaObject,
): void {
  let container: Container = root;
  let original: Container = source;
  path.forEach((segment, index) => {
    const key = String(segment);
    let next: unknown = value;
    if (index !== path.length - 1) {
      // Preorder replacements can omit containers present in the input.
      next = isContainer(container[key]) ? container[key] : original[key];
      if (copy && !ownedContainers.has(next as object)) {
        next = copyContainer(next as Container);
      }
      original = original[key] as Container;
    }
    Object.defineProperty(container, key, {
      value: next, enumerable: true, configurable: true, writable: true,
    });
    if (isContainer(next)) ownedContainers.add(next);
    container = next as Container;
  });
}

/** Combine selections by location, forwarding deeper selections through schema boundaries. */
export function discoverChildren(
  schema: JSONSchemaObject,
  selector: AdditionalSubschemas | undefined,
  inheritedPaths: PathSegment[][],
  basePath: PathSegment[],
  stringify: (path: PathSegment[]) => string,
): Child[] {
  const children = builtInChildren(schema);
  const seen = new Set(children.map(child => JSON.stringify(child.path.map(String))));
  const selections = selector ? selector(schema) : [];
  for (const { path } of [...selections, ...inheritedPaths.map(path => ({ path }))]) {
    if (!Array.isArray(path) || path.length === 0 || [...path].some(segment =>
      typeof segment !== "string" && (typeof segment !== "number" || !Number.isSafeInteger(segment) || segment < 0))) {
      throw new TypeError(`Invalid additionalSubschemas path at ${stringify(basePath)}; use a non-empty array of strings or non-negative integer indices.`);
    }
    const location = [...basePath, ...path];
    const value = readChild(schema, path);
    if (typeof value !== "boolean" && (!isContainer(value) || Array.isArray(value))) {
      throw new TypeError(`additionalSubschemas target at ${stringify(location)} must be an object or boolean schema.`);
    }
    const key = JSON.stringify(path.map(String));
    if (!seen.has(key)) {
      seen.add(key);
      children.push({ path: [...path], schema: value as JSONSchema, additionalPaths: [] });
    }
  }

  const byPath = new Map(children.map(child => [JSON.stringify(child.path.map(String)), child]));
  return children.filter(child => {
    for (let length = 1; length < child.path.length; length++) {
      const ancestor = byPath.get(JSON.stringify(child.path.slice(0, length).map(String)));
      if (ancestor) {
        ancestor.additionalPaths.push(child.path.slice(length));
        return false;
      }
    }
    return true;
  });
}
