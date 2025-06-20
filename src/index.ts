import { JSONSchema, JSONSchemaObject, PatternProperties } from "@json-schema-tools/meta-schema";
import { jsonPathStringify, isCycle, last } from "./utils";

/**
 * Signature of the mutation method passed to traverse.
 *
 * @param schema The schema or subschema node being traversed
 * @param isCycle false if the schema passed is not the root of a detected cycle. Useful for special handling of cycled schemas.
 * @param path json-path string in dot-notation as per [draft-goessner-dispatch-jsonpath-00](https://www.ietf.org/archive/id/draft-goessner-dispatch-jsonpath-00.html#name-overview-of-jsonpath-expres)
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
export default function traverse(
  schema: JSONSchema,
  mutation: MutationFunction,
  traverseOptions = defaultOptions,
  depth = 0,
  recursiveStack: JSONSchema[] = [],
  mutableStack: JSONSchema[] = [],
  pathStack: string[] = [],
  prePostMap: Array<[JSONSchema, JSONSchema]> = [],
  cycleSet: JSONSchema[] = [],
): JSONSchema {
  const opts = { ...defaultOptions, ...traverseOptions }; // would be nice to make an 'entry' func when we get around to optimizations

  // booleans are a bit messed. Since all other schemas are objects (non-primitive type
  // which gets a new address in mem) for each new JS refer to one of 2 memory addrs, and
  // thus adding it to the recursive stack will prevent it from being explored if the
  // boolean is seen in a further nested schema.
  if (depth === 0) {
    pathStack = [""];
  }

  if (typeof schema === "boolean" || schema instanceof Boolean) {
    if (opts.skipFirstMutation === true && depth === 0) {
      return schema;
    } else {
      return mutation(
        schema,
        false,
        jsonPathStringify(pathStack),
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
        jsonPathStringify(pathStack),
        last(mutableStack, 2)
      ) as JSONSchemaObject;
    }
  }

  recursiveStack.push(schema);
  prePostMap.push([schema, mutableSchema]);

  const rec = (s: JSONSchema, path: string[]): JSONSchema => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      cycleSet.push(foundCycle);

      // if the cycle is a ref to the root schema && skipFirstMutation is try we need to call mutate.
      // If we don't, it will never happen.
      if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
        return mutation(
          s,
          true,
          jsonPathStringify(path),
          last(mutableStack), // should we be popping here?
        );
      }

      const [, cycledMutableSchema] = prePostMap.find(
        ([orig]) => foundCycle === orig,
      ) as [JSONSchema, JSONSchema];

      return cycledMutableSchema;
    }

    // else
    return traverse(
      s,
      mutation,
      traverseOptions,
      depth + 1,
      recursiveStack,
      mutableStack,
      path,
      prePostMap,
      cycleSet,
    );
  };

  if (schema.anyOf) {
    mutableSchema.anyOf = schema.anyOf.map((x, i) => {
      const result = rec(x, [...pathStack, `anyOf[${i}]`]);
      return result;
    });
  } else if (schema.allOf) {
    mutableSchema.allOf = schema.allOf.map((x, i) => {
      const result = rec(x, [...pathStack, `allOf[${i}]`]);
      return result;
    });
  } else if (schema.oneOf) {
    mutableSchema.oneOf = schema.oneOf.map((x, i) => {
      const result = rec(x, [...pathStack, `oneOf[${i}]`]);
      return result;
    });
  } else {
    if (schema.items) {
      if (schema.items instanceof Array) {
        mutableSchema.items = schema.items.map((x, i) => {
          const result = rec(x, [...pathStack, `items[${i}]`]);
          return result;
        });
      } else {
        const foundCycle = isCycle(schema.items, recursiveStack);
        if (foundCycle) {
          cycleSet.push(foundCycle);

          if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
            mutableSchema.items = mutation(
              schema.items,
              true,
              jsonPathStringify(pathStack),
              last(mutableStack)
            );
          } else {
            const [, cycledMutableSchema] = prePostMap.find(
              ([orig]) => foundCycle === orig,
            ) as [JSONSchema, JSONSchema];

            mutableSchema.items = cycledMutableSchema;
          }
        } else {
          mutableSchema.items = traverse(
            schema.items,
            mutation,
            traverseOptions,
            depth + 1,
            recursiveStack,
            mutableStack,
            [...pathStack, "items"],
            prePostMap,
            cycleSet,
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

    if (schema.properties !== undefined) {
      const sProps: { [key: string]: JSONSchema } = schema.properties;
      const mutableProps: { [key: string]: JSONSchema } = {};

      Object.keys(schema.properties).forEach((schemaPropKey: string) => {
        mutableProps[schemaPropKey] = rec(sProps[schemaPropKey], [...pathStack, "properties", schemaPropKey.toString()]);
      });

      mutableSchema.properties = mutableProps;
    }

    if (schema.patternProperties !== undefined) {
      const sProps = schema.patternProperties;
      const mutableProps: PatternProperties = {};

      Object.keys(schema.patternProperties).forEach((regex: string) => {
        mutableProps[regex] = rec(sProps[regex], [...pathStack, "patternProperties", regex.toString()]);
      });

      mutableSchema.patternProperties = mutableProps;
    }

    if (schema.additionalProperties !== undefined && !!schema.additionalProperties === true) {
      mutableSchema.additionalProperties = rec(schema.additionalProperties, [...pathStack, "additionalProperties"]);
    }
  }

  if (opts.skipFirstMutation === true && depth === 0) {
    return mutableSchema;
  }

  if (opts.bfs === true) {
    mutableStack.pop();
    return mutableSchema;
  } else {
    const isCycleNode = cycleSet.indexOf(schema) !== -1
    mutableStack.pop();
    return mutation(
      mutableSchema,
      isCycleNode,
      jsonPathStringify(pathStack),
      last(mutableStack)
    );
  }
}
