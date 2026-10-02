import { withCycleFlags } from "./cycle-flags";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import { jsonPathStringify, jsonPointerStringify, isCycle, last, PathSegment } from "./utils";
import { reconnectReferences } from "./references";
import { runTraversal } from "./async";
import { discoverChildren, AdditionalSubschemas, copyContainer, writeChild } from "./children";

export type { AdditionalSubschema, AdditionalSubschemas } from "./children";
export type { PathSegment } from "./utils";

/**
 * Signature of the mutation method passed to traverse.
 * Return a schema to keep or replace the node. With allowUndefinedReturn enabled,
 * returning undefined (or nothing) keeps the schema passed to the callback.
 *
 * @param schema The schema or subschema node being traversed
 * @param isCycle false if the schema passed is not the root of a detected cycle. Useful for special handling of cycled schemas.
 * @param path Location of the visited schema in the selected pathFormat. JSONPath (default) uses `$` for the root; JSON Pointer uses the empty string. Pointers are relative to the input schema, not the instance being validated. URI-fragment encoding is not applied.
 * @param parent A reference to JSONSchema that is the parent of the `schema` param. If the `schema` is the root schema, `parent` will be `undefined`. when schema is a cycle, parent is the parent of the referenced cycle (once again, if the cycled schema is the root, the parent will be undefined).
 * @returns A schema or a promise/thenable resolving to one, including boolean schemas.
 * Undefined (sync or resolved) keeps the node only with allowUndefinedReturn enabled.
 */
export type MutationFunction = (
  schema: JSONSchema,
  isCycle: boolean,
  path: string,
  parent: JSONSchema,
) => MutationResult;

/** A synchronous or asynchronous mutation result. */
export type MutationResult = JSONSchema | void | PromiseLike<JSONSchema | void>;

/** A callback whose result is always synchronous. */
export type SyncMutationFunction = (...args: Parameters<MutationFunction>) => JSONSchema | void;

type MutationIterator = Generator<MutationResult, JSONSchema, JSONSchema | void>;

/**
 * The options you can use when traversing.
 */
export interface TraverseOptions {
  /**
   * Declare extra subschemas using non-empty paths relative to each object schema.
   * Called once per visited object, on the input node before child mutations.
   * Built-in locations and duplicate paths are visited only once. Targets must
   * be object or boolean schemas; intermediate objects/arrays are containers.
   */
  additionalSubschemas?: AdditionalSubschemas;

  /** Callback path format. Defaults to JSONPath; JSON Pointer uses RFC 6901 strings with an empty root path. */
  pathFormat?: "jsonpath" | "jsonpointer";

  /**
   * Set this to true if you don't want to call the mutator function on the root schema.
   */
  skipFirstMutation?: boolean;

  /**
   * Allow callbacks to return undefined (or nothing) to keep the node passed to them,
   * including any in-place edits. This also applies to promises resolving to undefined.
   * When false (the default), an undefined return
   * throws a TypeError with the node path. This option does not remove nodes.
   */
  allowUndefinedReturn?: boolean;

  /**
   * Set this to true if you want to merge the returned value of the mutation function into
   * the original schema.
   */
  mergeNotMutate?: boolean;

  /**
   * true if you want the original schema that was provided to be directly modified by the provided mutation/merge function
   * To preserve cyclical refs this is necessary.
   */
  mutable?: boolean;

  /**
   * true to call the mutation function before visiting each schema's children.
   * Despite the name, this is preorder depth-first traversal, not level-by-level breadth-first traversal.
   */
  bfs?: boolean;
}

export const defaultOptions: TraverseOptions = {
  pathFormat: "jsonpath",
  skipFirstMutation: false,
  mutable: false,
  bfs: false,
  allowUndefinedReturn: false,
};

/**
 * Traverse all subschema of a schema, calling the mutator function with each.
 * The mutator is called on leaf nodes first.
 *
 * @param schema the schema to traverse
 * @param mutation the function to pass each node in the subschema tree.
 * @param traverseOptions a set of options for traversal.
 * @param depth For internal use. Tracks the current recursive depth in the tree. This is used to implement
 *              some of the options.
 *
 */
export function traverseInternal(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions: TraverseOptions,
  depth: number,
  recursiveStack: JSONSchema[],
  mutableStack: JSONSchema[],
  pathStack: PathSegment[],
  prePostMap: Array<[JSONSchema, JSONSchema]>,
  cycleSet: JSONSchema[],
  replacements: Map<JSONSchema, JSONSchema>,
  childLocations: Map<JSONSchema, PathSegment[][]> = new Map(),
  additionalPaths: PathSegment[][] = [],
): JSONSchema | Promise<JSONSchema> {
  return runTraversal(traverseGenerator(
    schema, mutation, traverseOptions, depth, recursiveStack, mutableStack,
    pathStack, prePostMap, cycleSet, replacements, childLocations, additionalPaths,
  ));
}

function* traverseGenerator(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions: TraverseOptions,
  depth: number,
  recursiveStack: JSONSchema[],
  mutableStack: JSONSchema[],
  pathStack: PathSegment[],
  prePostMap: Array<[JSONSchema, JSONSchema]>,
  cycleSet: JSONSchema[],
  replacements: Map<JSONSchema, JSONSchema>,
  childLocations: Map<JSONSchema, PathSegment[][]>,
  additionalPaths: PathSegment[][],
): MutationIterator {
  const opts = traverseOptions;
  const stringifyPath = opts.pathFormat === "jsonpointer" ? jsonPointerStringify : jsonPathStringify;
  const mutate = function* (
    node: JSONSchema,
    isCycleNode: boolean,
    path: string,
    parent: JSONSchema,
  ): MutationIterator {
    const result = yield mutation(node, isCycleNode, path, parent);
    if (result === undefined) {
      if (opts.allowUndefinedReturn === true) {
        return node;
      }
      throw new TypeError(
        `Traversal callback returned undefined at ${path}; return a schema or set allowUndefinedReturn: true.`,
      );
    }
    return result;
  };

  // booleans are a bit messed. Since all other schemas are objects (non-primitive type
  // which gets a new address in mem) for each new JS refer to one of 2 memory addrs, and
  // thus adding it to the recursive stack will prevent it from being explored if the
  // boolean is seen in a further nested schema.
  if (depth === 0) {
    pathStack = [];
  }

  if (typeof schema === "boolean" || schema instanceof Boolean) {
    if (opts.skipFirstMutation === true && depth === 0) {
      return schema;
    } else {
      return yield* mutate(
        schema,
        false,
        stringifyPath(pathStack),
        last(mutableStack)
      );
    }
  }

  let mutableSchema: JSONSchemaObject = schema;
  if (opts.mutable === false) {
    mutableSchema = copyContainer(schema);
  }

  mutableStack.push(mutableSchema);

  if (opts.bfs === true) {
    if (opts.skipFirstMutation === false || depth !== 0) {
      mutableSchema = (yield* mutate(
        mutableSchema,
        false,
        stringifyPath(pathStack),
        last(mutableStack, 2)
      )) as JSONSchemaObject;
    }
  }

  mutableStack[mutableStack.length - 1] = mutableSchema;
  recursiveStack.push(schema);
  const schemaPair: [JSONSchema, JSONSchema] = [schema, mutableSchema];
  prePostMap.push(schemaPair);
  if (schema !== mutableSchema) {
    replacements.set(schema, mutableSchema);
  }
  // A preorder boolean replacement is a leaf, regardless of input children.
  if (typeof mutableSchema === "boolean") {
    mutableStack.pop();
    return mutableSchema;
  }
  const children = discoverChildren(schema, opts.additionalSubschemas, additionalPaths, pathStack, stringifyPath);
  childLocations.set(mutableSchema, children.map(({ path }) => path));

  const replace = (pair: [JSONSchema, JSONSchema], result: JSONSchema): JSONSchema => {
    const previous = pair[1];
    if (typeof previous === "object" && previous !== result) {
      replacements.set(previous, result);
    }
    if (pair[0] !== result) {
      replacements.set(pair[0], result);
    } else {
      replacements.delete(pair[0]);
    }
    childLocations.set(result, childLocations.get(previous) as PathSegment[][]);
    pair[1] = result;
    return result;
  };

  const rec = function* (s: JSONSchema, path: PathSegment[], nestedPaths: PathSegment[][]): MutationIterator {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      cycleSet.push(foundCycle);

      // if the cycle is a ref to the root schema && skipFirstMutation is try we need to call mutate.
      // If we don't, it will never happen.
      if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
        const rootPair = prePostMap[0];
        return replace(rootPair, yield* mutate(
          rootPair[1],
          true,
          stringifyPath(path),
          last(mutableStack), // should we be popping here?
        ));
      }

      const [, cycledMutableSchema] = prePostMap.find(
        ([orig]) => foundCycle === orig,
      ) as [JSONSchema, JSONSchema];

      return cycledMutableSchema;
    }

    // else
    return yield* traverseGenerator(
      s,
      mutation,
      traverseOptions,
      depth + 1,
      recursiveStack,
      mutableStack,
      path,
      prePostMap,
      cycleSet,
      replacements,
      childLocations,
      nestedPaths,
    );
  };

  const ownedContainers = new WeakSet<object>();
  // Preserve existing container-copy behavior, including empty maps/arrays.
  for (const keyword of ["anyOf", "allOf", "oneOf", "items", "properties", "patternProperties"]) {
    const container = schema[keyword];
    if (Array.isArray(container) ||
      ((keyword === "properties" || keyword === "patternProperties") && container !== undefined)) {
      mutableSchema[keyword] = copyContainer(container);
      ownedContainers.add(mutableSchema[keyword]);
    }
  }

  for (const child of children) {
    const result = yield* rec(child.schema, [...pathStack, ...child.path], child.additionalPaths);
    writeChild(mutableSchema, child.path, result, opts.mutable !== true || mutableSchema !== schema, ownedContainers, schema);
  }

  if (opts.skipFirstMutation === true && depth === 0) {
    return reconnectReferences(schemaPair[1], replacements, childLocations);
  }

  if (opts.bfs === true) {
    mutableStack.pop();
    return depth === 0 ? reconnectReferences(mutableSchema, replacements, childLocations) : mutableSchema;
  } else {
    const isCycleNode = cycleSet.indexOf(schema) !== -1
    mutableStack.pop();
    const result = replace(schemaPair, yield* mutate(
      mutableSchema,
      isCycleNode,
      stringifyPath(pathStack),
      last(mutableStack)
    ));
    return depth === 0 ? reconnectReferences(result, replacements, childLocations) : result;
  }
}

/** Return the completed schema immediately when every invoked callback is synchronous. */
export default function traverse(
  schema: JSONSchema,
  mutation: SyncMutationFunction,
  traverseOptions?: TraverseOptions,
): JSONSchema;
/**
 * Return a promise only when an invoked callback returns a promise or thenable.
 * Callbacks run sequentially; each resolved result is applied before continuing.
 * Errors throw before the first promise and reject after it. Mutable edits are not rolled back.
 */
export default function traverse(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions?: TraverseOptions,
): JSONSchema | Promise<JSONSchema>;
export default function traverse(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions: TraverseOptions = defaultOptions,
): JSONSchema | Promise<JSONSchema> {
  const opts = { ...defaultOptions, ...traverseOptions };
  return traverseInternal(
    schema,
    opts.bfs === true ? withCycleFlags(schema, mutation, opts) : mutation,
    opts,
    0,
    [],
    [],
    [],
    [],
    [],
    new Map(),
  );
}
