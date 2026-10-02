import { JSONSchema, JSONSchemaObject, PatternProperties } from "@json-schema-tools/meta-schema";
import { jsonPathStringify, jsonPointerStringify, isCycle, last, PathSegment } from "./utils";
import { reconnectReferences } from "./references";

/**
 * Signature of the mutation method passed to traverse.
 *
 * @param schema The schema or subschema node being traversed
 * @param isCycle false if the schema passed is not the root of a detected cycle. Useful for special handling of cycled schemas.
 * @param path Location of the visited schema in the selected pathFormat. JSONPath (default) uses `$` for the root; JSON Pointer uses the empty string. Pointers are relative to the input schema, not the instance being validated. URI-fragment encoding is not applied.
 * @param parent A reference to JSONSchema that is the parent of the `schema` param. If the `schema` is the root schema, `parent` will be `undefined`. when schema is a cycle, parent is the parent of the referenced cycle (once again, if the cycled schema is the root, the parent will be undefined).
 */
export type MutationFunction = (
  schema: JSONSchema,
  isCycle: boolean,
  path: string,
  parent: JSONSchema,
) => JSONSchema;

/**
 * The options you can use when traversing.
 */
export interface TraverseOptions {
  /** Callback path format. Defaults to JSONPath; JSON Pointer uses RFC 6901 strings with an empty root path. */
  pathFormat?: "jsonpath" | "jsonpointer";

  /**
   * Set this to true if you don't want to call the mutator function on the root schema.
   */
  skipFirstMutation?: boolean;

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
   * true if you want to traverse in a breadth-first manner. This will cause the mutation function to be called first with
   * the root schema, moving down the subschemas until the terminal subschemas.
   */
  bfs?: boolean;
}

export const defaultOptions: TraverseOptions = {
  pathFormat: "jsonpath",
  skipFirstMutation: false,
  mutable: false,
  bfs: false,
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
): JSONSchema {
  const opts = traverseOptions;
  const stringifyPath = opts.pathFormat === "jsonpointer" ? jsonPointerStringify : jsonPathStringify;

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
      return mutation(
        schema,
        false,
        stringifyPath(pathStack),
        last(mutableStack)
      );
    }
  }

  let mutableSchema: JSONSchemaObject = schema;
  if (opts.mutable === false) {
    mutableSchema = { ...schema };
  }

  mutableStack.push(mutableSchema);

  if (opts.bfs === true) {
    if (opts.skipFirstMutation === false || depth !== 0) {
      mutableSchema = mutation(
        mutableSchema,
        false,
        stringifyPath(pathStack),
        last(mutableStack, 2)
      ) as JSONSchemaObject;
    }
  }

  recursiveStack.push(schema);
  const schemaPair: [JSONSchema, JSONSchema] = [schema, mutableSchema];
  prePostMap.push(schemaPair);
  if (schema !== mutableSchema) {
    replacements.set(schema, mutableSchema);
  }

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
    pair[1] = result;
    return result;
  };

  const rec = (s: JSONSchema, path: PathSegment[]): JSONSchema => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      cycleSet.push(foundCycle);

      // if the cycle is a ref to the root schema && skipFirstMutation is try we need to call mutate.
      // If we don't, it will never happen.
      if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
        const rootPair = prePostMap[0];
        return replace(rootPair, mutation(
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
    return traverseInternal(
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
    );
  };

  if (schema.anyOf) {
    mutableSchema.anyOf = schema.anyOf.map((x, i) => {
      const result = rec(x, [...pathStack, "anyOf", i]);
      return result;
    });
  }
  if (schema.allOf) {
    mutableSchema.allOf = schema.allOf.map((x, i) => {
      const result = rec(x, [...pathStack, "allOf", i]);
      return result;
    });
  }
  if (schema.oneOf) {
    mutableSchema.oneOf = schema.oneOf.map((x, i) => {
      const result = rec(x, [...pathStack, "oneOf", i]);
      return result;
    });
  }
  if (schema.items) {
    if (schema.items instanceof Array) {
      mutableSchema.items = schema.items.map((x, i) => {
        const result = rec(x, [...pathStack, "items", i]);
        return result;
      });
    } else {
      const foundCycle = isCycle(schema.items, recursiveStack);
      if (foundCycle) {
        cycleSet.push(foundCycle);

        if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
          const rootPair = prePostMap[0];
          mutableSchema.items = replace(rootPair, mutation(
            rootPair[1],
            true,
            stringifyPath([...pathStack, "items"]),
            last(mutableStack)
          ));
        } else {
          const [, cycledMutableSchema] = prePostMap.find(
            ([orig]) => foundCycle === orig,
          ) as [JSONSchema, JSONSchema];

          mutableSchema.items = cycledMutableSchema;
        }
      } else {
        mutableSchema.items = traverseInternal(
          schema.items,
          mutation,
          traverseOptions,
          depth + 1,
          recursiveStack,
          mutableStack,
          [...pathStack, "items"],
          prePostMap,
          cycleSet,
          replacements,
        );
      }
    }
  }

  if (schema.additionalItems !== undefined) {
    mutableSchema.additionalItems = rec(
      schema.additionalItems,
      [...pathStack, "additionalItems"]
    );
  }

  if (schema.contains !== undefined) {
    mutableSchema.contains = rec(
      schema.contains,
      [...pathStack, "contains"],
    );
  }

  if (schema.unevaluatedItems !== undefined) {
    mutableSchema.unevaluatedItems = rec(
      schema.unevaluatedItems,
      [...pathStack, "unevaluatedItems"],
    );
  }

  if (schema.properties !== undefined) {
    const sProps: { [key: string]: JSONSchema } = schema.properties;
    const mutableProps: { [key: string]: JSONSchema } = {};

    Object.keys(schema.properties).forEach((schemaPropKey: string) => {
      Object.defineProperty(mutableProps, schemaPropKey, {
        value: rec(sProps[schemaPropKey], [...pathStack, "properties", schemaPropKey.toString()]),
        enumerable: true, configurable: true, writable: true,
      });
    });

    mutableSchema.properties = mutableProps;
  }

  if (schema.patternProperties !== undefined) {
    const sProps = schema.patternProperties;
    const mutableProps: PatternProperties = {};

    Object.keys(schema.patternProperties).forEach((regex: string) => {
      Object.defineProperty(mutableProps, regex, {
        value: rec(sProps[regex], [...pathStack, "patternProperties", regex.toString()]),
        enumerable: true, configurable: true, writable: true,
      });
    });

    mutableSchema.patternProperties = mutableProps;
  }

  if (schema.additionalProperties !== undefined && !!schema.additionalProperties === true) {
    mutableSchema.additionalProperties = rec(schema.additionalProperties, [...pathStack, "additionalProperties"]);
  }

  if (schema.propertyNames !== undefined) {
    mutableSchema.propertyNames = rec(
      schema.propertyNames,
      [...pathStack, "propertyNames"],
    );
  }

  if (schema.unevaluatedProperties !== undefined && !!schema.unevaluatedProperties === true) {
    mutableSchema.unevaluatedProperties = rec(
      schema.unevaluatedProperties,
      [...pathStack, "unevaluatedProperties"],
    );
  }

  if (opts.skipFirstMutation === true && depth === 0) {
    return reconnectReferences(schemaPair[1], replacements);
  }

  if (opts.bfs === true) {
    mutableStack.pop();
    return mutableSchema;
  } else {
    const isCycleNode = cycleSet.indexOf(schema) !== -1
    mutableStack.pop();
    const result = replace(schemaPair, mutation(
      mutableSchema,
      isCycleNode,
      stringifyPath(pathStack),
      last(mutableStack)
    ));
    return depth === 0 ? reconnectReferences(result, replacements) : result;
  }
}

export default function traverse(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions: TraverseOptions = defaultOptions,
) {
  const opts = { ...defaultOptions, ...traverseOptions };
  return traverseInternal(
    schema,
    mutation,
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
