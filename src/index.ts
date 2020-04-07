import merge from "lodash.merge";
import JSONMetaSchema from "@json-schema-tools/meta-schema";

/**
 * Signature of the mutation method passed to traverse.
 */
export type MutationFunction = (schema: JSONSchema) => JSONSchema;

/**
 * The options you can use when traversing.
 */
export interface ITraverseOptions {
  /**
   * Set this to true if you don't want to call the mutator function on the root schema.
   */
  skipFirstMutation: boolean;
}

export const defaultOptions: ITraverseOptions = {
  skipFirstMutation: false,
};

const isCycle = (s: JSONSchema, recursiveStack: JSONSchema[]) => {
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
  prePostMap: Array<[JSONSchema, JSONSchema]> = [],
) {
  const mutableSchema: JSONSchema = { ...schema };
  recursiveStack.push(schema);

  prePostMap.push([schema, mutableSchema]);

  const rec = (s: JSONSchema) => {
    const foundCycle = isCycle(s, recursiveStack);
    if (foundCycle) {
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
      prePostMap,
    );
  };

  if (schema.anyOf) {
    mutableSchema.anyOf = schema.anyOf.map(rec);
  } else if (schema.allOf) {
    mutableSchema.allOf = schema.allOf.map(rec);
  } else if (schema.oneOf) {
    mutableSchema.oneOf = schema.oneOf.map(rec);
  } else if (schema.items) {
    if (schema.items instanceof Array) {
      mutableSchema.items = schema.items.map(rec);
    } else if (schema.items as any === true) {
      mutableSchema.items = mutation(schema.items);
    } else {
      const foundCycle = isCycle(schema.items, recursiveStack);
      if (foundCycle) {
        const [, cycledMutableSchema] = prePostMap.find(
          ([orig]) => foundCycle === orig,
        ) as [JSONSchema, JSONSchema];
        mutableSchema.items = cycledMutableSchema;
      } else {
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
  } else if (schema.properties) {
    const sProps: { [key: string]: JSONSchema } = schema.properties;
    mutableSchema.properties = Object.keys(sProps)
      .reduce(
        (r: JSONSchema, v: string) => ({ ...r, ...{ [v]: rec(sProps[v]) } }),
        {},
      );
  }

  if (traverseOptions.skipFirstMutation === true && depth === 0) {
    return mutableSchema;
  } else {
    merge(mutableSchema, mutation(mutableSchema));
    return mutableSchema;
  }
}
