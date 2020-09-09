import { JSONSchema, JSONSchemaObject, Properties, PatternProperties } from "@json-schema-tools/meta-schema";
import { isNumber } from "util";

/**
 * Signature of the mutation method passed to traverse.
 *
 * @param schema The schema or subschema node being traversed
 * @param isRootOfCycle false if the schema passed is not the root of a detected cycle. Useful for special handling of cycled schemas.
 * @param path json path string separated by periods
 */
export type MutationFunction = (schema: JSONSchema, isRootOfCycle: boolean, path: string, ) => JSONSchema;

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

const jsonPathStringify = (s: any[]) => {
  return s.map(i => i === "" ? `${i}` : `/${i}`).join("");
};

const isCycle = (s: JSONSchema, recursiveStack: JSONSchema[]): JSONSchema | false => {
  const foundInRecursiveStack = recursiveStack.find((recSchema) => recSchema === s);
  if (foundInRecursiveStack) {
    return foundInRecursiveStack;
  }
  return false;
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
  pathStack: any[] = [],
  prePostMap: Array<[JSONSchema, JSONSchema]> = [],
): JSONSchema {
  let isRootOfCycle = false;
  const opts = { ...defaultOptions, ...traverseOptions }; // would be nice to make an 'entry' func when we get around to optimizations

  // booleans are a bit messed. Since all other schemas are objects (non-primitive type
  // which gets a new address in mem) for each new JS refer to one of 2 memory addrs, and
  // thus adding it to the recursive stack will prevent it from being explored if the
  // boolean is seen in a further nested schema.
  if(depth === 0) {
    pathStack.push("");
  }

  if (typeof schema === "boolean" || schema instanceof Boolean) {
    if (opts.skipFirstMutation === true && depth === 0) {
      return schema;
    } else {
      return mutation(schema, false, jsonPathStringify(pathStack));
    }
  }

  let mutableSchema: JSONSchemaObject = schema;
  if (opts.mutable === false) {
    mutableSchema = { ...schema };
  }

  if (opts.bfs === true) {
    if (opts.skipFirstMutation === false || depth !== 0) {
      mutableSchema = mutation(mutableSchema, false, jsonPathStringify(pathStack)) as JSONSchemaObject;
    }
  }

  recursiveStack.push(schema);

  prePostMap.push([schema, mutableSchema]);

  const rec = (s: JSONSchema): JSONSchema => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      if (foundCycle === schema) { isRootOfCycle = true; }

      // if the cycle is a ref to the root schema && skipFirstMutation is try we need to call mutate.
      // If we don't, it will never happen.
      if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
        return mutation(s, true, jsonPathStringify(pathStack));
      }

      const [, cycledMutableSchema] = prePostMap.find(
        ([orig]) => foundCycle === orig,
      ) as [JSONSchema, JSONSchema];

      return cycledMutableSchema;
    }

    return traverse(
      s,
      mutation,
      traverseOptions,
      depth + 1,
      recursiveStack,
      pathStack,
      prePostMap,
    );
  };

  if (schema.anyOf) {
    pathStack.push("anyOf");
    mutableSchema.anyOf = schema.anyOf.map((x,i) => {
      pathStack.push(i);
      const result = rec(x);
      pathStack.pop();
      return result;
    });
    pathStack.pop();
  } else if (schema.allOf) {
    pathStack.push("allOf");
    mutableSchema.allOf = schema.allOf.map((x,i) => {
      pathStack.push(i);
      const result = rec(x);
      pathStack.pop();
      return result;
    });
    pathStack.pop();
  } else if (schema.oneOf) {
    pathStack.push("oneOf");
    mutableSchema.oneOf = schema.oneOf.map((x,i) => {
      pathStack.push(i);
      const result = rec(x);
      pathStack.pop();
      return result;
    });
    pathStack.pop();
  } else {
    let itemsIsSingleSchema = false;

    if (schema.items) {
      if (schema.items instanceof Array) {
        pathStack.push("items");
        mutableSchema.items = schema.items.map((x,i) => {
          pathStack.push(i);
          const result = rec(x);
          pathStack.pop();
          return result;
        });
        pathStack.pop();
      } else {
        const foundCycle = isCycle(schema.items, recursiveStack);
        if (foundCycle) {
          if (foundCycle === schema) { isRootOfCycle = true; }

          if (opts.skipFirstMutation === true && foundCycle === recursiveStack[0]) {
            mutableSchema.items = mutation(schema.items, true, jsonPathStringify(pathStack));
          } else {
            const [, cycledMutableSchema] = prePostMap.find(
              ([orig]) => foundCycle === orig,
            ) as [JSONSchema, JSONSchema];

            mutableSchema.items = cycledMutableSchema;
          }
        } else {
          itemsIsSingleSchema = true;
          mutableSchema.items = traverse(
            schema.items,
            mutation,
            traverseOptions,
            depth + 1,
            recursiveStack,
            pathStack,
            prePostMap,
          );
        }
      }
    }

    if (schema.additionalItems !== undefined && !!schema.additionalItems === true && !itemsIsSingleSchema) {
      pathStack.push("additionalItems");
      mutableSchema.additionalItems = rec(schema.additionalItems);
      pathStack.pop();
    }

    if (schema.properties !== undefined) {
      const sProps: { [key: string]: JSONSchema } = schema.properties;
      const mutableProps: { [key: string]: JSONSchema } = {};

      pathStack.push("properties");
      Object.keys(schema.properties).forEach((schemaPropKey: string) => {
        pathStack.push(schemaPropKey);
        mutableProps[schemaPropKey] = rec(sProps[schemaPropKey]);
        pathStack.pop();
      });
      pathStack.pop();

      mutableSchema.properties = mutableProps;
    }

    if (schema.patternProperties !== undefined) {
      const sProps = schema.patternProperties;
      const mutableProps: PatternProperties = {};

      pathStack.push("patternProperties");
      Object.keys(schema.patternProperties).forEach((regex: string) => {
        pathStack.push(regex);
        mutableProps[regex] = rec(sProps[regex]);
        pathStack.pop();
      });
      pathStack.pop();

      mutableSchema.patternProperties = mutableProps;
    }

    if (schema.additionalProperties !== undefined && !!schema.additionalProperties === true) {
      pathStack.push("additionalProperties");
      mutableSchema.additionalProperties = rec(schema.additionalProperties);
      pathStack.pop();
    }
  }

  if (opts.skipFirstMutation === true && depth === 0) {
    return mutableSchema;
  }

  if (opts.bfs === true) {
    return mutableSchema;
  } else {
    return mutation(mutableSchema, isRootOfCycle, jsonPathStringify(pathStack));
  }
}
