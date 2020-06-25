import merge from "lodash.merge";
import { CoreSchemaMetaSchema as JSONMetaSchema } from "@json-schema-tools/meta-schema";

/**
 * Signature of the mutation method passed to traverse.
 */
export type MutationFunction = (schema: JSONMetaSchema) => JSONMetaSchema;
export type MutationFunctionAsync = (schema: JSONMetaSchema) => Promise<JSONMetaSchema>;

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
}

export const defaultOptions: TraverseOptions = {
  skipFirstMutation: false,
  mergeNotMutate: false,
};

const isCycle = (s: JSONMetaSchema, recursiveStack: JSONMetaSchema[]) => {
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
  schema: JSONMetaSchema,
  mutation: MutationFunction,
  traverseOptions = defaultOptions,
  depth = 0,
  recursiveStack: JSONMetaSchema[] = [],
  prePostMap: Array<[JSONMetaSchema, JSONMetaSchema]> = [],
): JSONMetaSchema {

  // booleans are a bit messed. Since all other schemas are objects (non-primitive type
  // which gets a new address in mem) for each new JS refer to one of 2 memory addrs, and
  // thus adding it to the recursive stack will prevent it from being explored if the
  // boolean is seen in a further nested schema.
  if (typeof schema === "boolean" || schema instanceof Boolean) {
    if (traverseOptions.skipFirstMutation === true && depth === 0) {
      return schema;
    } else {
      return mutation(schema);
    }
  }

  const mutableSchema: JSONMetaSchema = { ...schema };
  recursiveStack.push(schema);

  prePostMap.push([schema, mutableSchema]);

  const rec = (s: JSONMetaSchema) => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      const [, cycledMutableSchema] = prePostMap.find(
        ([orig]) => foundCycle === orig,
      ) as [JSONMetaSchema, JSONMetaSchema];
      return cycledMutableSchema;
    }

    return traverse(
      s,
      mutation,
      traverseOptions,
      depth + 1,
      recursiveStack,
      prePostMap,
    );
  };


  if (schema.anyOf) {
    mutableSchema.anyOf = schema.anyOf.map(rec);
  } else if (schema.allOf) {
    mutableSchema.allOf = schema.allOf.map(rec);
  } else if (schema.oneOf) {
    mutableSchema.oneOf = schema.oneOf.map(rec);
  } else {
    let itemsIsSingleSchema = false;

    if (schema.items) {
      if (schema.items instanceof Array) {
        mutableSchema.items = schema.items.map(rec);
      } else {
        const foundCycle = isCycle(schema.items, recursiveStack);
        if (foundCycle) {
          const [, cycledMutableSchema] = prePostMap.find(
            ([orig]) => foundCycle === orig,
          ) as [JSONMetaSchema, JSONMetaSchema];
          mutableSchema.items = cycledMutableSchema;
        } else {
          itemsIsSingleSchema = true;
          mutableSchema.items = traverse(
            schema.items,
            mutation,
            traverseOptions,
            depth + 1,
            recursiveStack,
            prePostMap,
          );
        }
      }
    }

    if (!!schema.additionalItems === true && !itemsIsSingleSchema) {
      mutableSchema.additionalItems = rec(schema.additionalItems);
    }

    if (schema.properties) {
      const sProps: { [key: string]: JSONMetaSchema } = schema.properties;
      mutableSchema.properties = Object.keys(sProps)
        .reduce(
          (r: JSONMetaSchema, v: string) => ({ ...r, ...{ [v]: rec(sProps[v]) } }),
          {},
        );
    }

    if (!!schema.additionalProperties === true) {
      mutableSchema.additionalProperties = rec(schema.additionalProperties);
    }
  }

  if (traverseOptions.skipFirstMutation === true && depth === 0) {
    return mutableSchema;
  }

  const mutationResult = mutation(mutableSchema);

  if (traverseOptions.mergeNotMutate) {
    merge(mutableSchema, mutationResult);
    return mutableSchema;
  }

  return mutationResult;
}

/**
 * Same as Traverse, but with support for async mutation functions
 *
 * @param schema the schema to traverse
 * @param mutation the function to pass each node in the subschema tree.
 * @param traverseOptions a set of options for traversal.
 * @param depth For internal use. Tracks the current recursive depth in the tree. This is used to implement
 *              some of the options.
 *
 */
export async function traverseAsync(
  schema: JSONMetaSchema | Promise<JSONMetaSchema>,
  mutation: MutationFunctionAsync,
  traverseOptions = defaultOptions,
  depth = 0,
  recursiveStack: JSONMetaSchema[] = [],
  prePostMap: Array<[JSONMetaSchema, JSONMetaSchema]> = [],
  promises: Array<Promise<JSONMetaSchema>> = [],
): Promise<JSONMetaSchema> {

  // booleans are a bit messed. Since all other schemas are objects (non-primitive type
  // which gets a new address in mem) for each new JS refer to one of 2 memory addrs, and
  // thus adding it to the recursive stack will prevent it from being explored if the
  // boolean is seen in a further nested schema.
  if (typeof schema === "boolean" || schema instanceof Boolean) {
    if (traverseOptions.skipFirstMutation === true && depth === 0) {
      return schema;
    } else {
      const mutationResult = mutation(schema);
      promises.push(mutationResult);
      return mutationResult;
    }
  }

  let resolvedSchema = schema as JSONMetaSchema;
  if (schema instanceof Promise) {
    resolvedSchema = await schema;
  }

  const mutableSchema: JSONMetaSchema = { ...resolvedSchema };
  recursiveStack.push(resolvedSchema);

  prePostMap.push([resolvedSchema, mutableSchema]);

  const rec = (s: JSONMetaSchema): JSONMetaSchema => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
      const [, cycledMutableSchema] = prePostMap.find(
        ([orig]) => foundCycle === orig,
      ) as [JSONMetaSchema, JSONMetaSchema];
      return cycledMutableSchema;
    }

    return traverseAsync(
      s,
      mutation,
      traverseOptions,
      depth + 1,
      recursiveStack,
      prePostMap,
      promises,
    );
  };


  if (resolvedSchema.anyOf) {
    mutableSchema.anyOf = resolvedSchema.anyOf.map(rec);
  } else if (resolvedSchema.allOf) {
    mutableSchema.allOf = resolvedSchema.allOf.map(rec);
  } else if (resolvedSchema.oneOf) {
    mutableSchema.oneOf = resolvedSchema.oneOf.map(rec);
  } else {
    let itemsIsSingleSchema = false;

    if (resolvedSchema.items) {
      if (resolvedSchema.items instanceof Array) {
        mutableSchema.items = resolvedSchema.items.map(rec);
      } else {
        const foundCycle = isCycle(resolvedSchema.items, recursiveStack);
        if (foundCycle) {
          const [, cycledMutableSchema] = prePostMap.find(
            ([orig]) => foundCycle === orig,
          ) as [JSONMetaSchema, JSONMetaSchema];
          mutableSchema.items = cycledMutableSchema;
        } else {
          itemsIsSingleSchema = true;
          mutableSchema.items = traverseAsync(
            resolvedSchema.items,
            mutation,
            traverseOptions,
            depth + 1,
            recursiveStack,
            prePostMap,
            promises
          );
        }
      }
    }

    if (!!resolvedSchema.additionalItems === true && !itemsIsSingleSchema) {
      mutableSchema.additionalItems = rec(resolvedSchema.additionalItems);
    }

    if (resolvedSchema.properties) {
      const sProps: { [key: string]: JSONMetaSchema } = resolvedSchema.properties;
      mutableSchema.properties = Object.keys(sProps)
        .reduce(
          (r: JSONMetaSchema, v: string) => ({ ...r, ...{ [v]: rec(sProps[v]) } }),
          {},
        );
    }

    if (!!resolvedSchema.additionalProperties === true) {
      mutableSchema.additionalProperties = rec(resolvedSchema.additionalProperties);
    }
  }

  if (traverseOptions.skipFirstMutation === true && depth === 0) {
    return mutableSchema;
  }

  const mutationResult = mutation(mutableSchema);
  promises.push(mutationResult);

  if (traverseOptions.mergeNotMutate) {
    merge(mutableSchema, await mutationResult);
    return mutableSchema;
  }

  if (depth === 0) {
    return Promise.all(promises).then(() => mutationResult);
  }

  return mutationResult;
}
