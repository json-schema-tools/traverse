import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

const examples: Array<[string, JSONSchemaObject, string]> = [
  ["not", { not: {} }, "$.not"],
  ["if", { if: {} }, "$.if"],
  ["then", { if: {}, then: {} }, "$.then"],
  ["else", { if: {}, else: {} }, "$.else"],
  ["definitions", { definitions: { entry: {} } }, "$.definitions.entry"],
  ["$defs", { $defs: { entry: {} } }, '$["$defs"].entry'],
  ["dependencies", { dependencies: { entry: {}, names: ["other"] } }, "$.dependencies.entry"],
  ["dependentSchemas", { dependentSchemas: { entry: {} } }, "$.dependentSchemas.entry"],
  ["prefixItems", { prefixItems: [{}], items: true }, "$.prefixItems[0]"],
];

it.each(examples)("visits standard %s locations", (_keyword, schema, expectedPath) => {
  const paths: string[] = [];
  traverse(schema, (node, _cycle, path) => { paths.push(path); return node; });
  expect(paths).toContain(expectedPath);
});

describe.each([false, true])("standard subschemas with mutable=%s", mutable => {
  it.each([false, true])("replaces boolean and object schemas with bfs=%s", async bfs => {
    const names = Object.freeze(["other"]);
    const root: JSONSchemaObject = {
      not: false, if: true, then: {}, else: false,
      definitions: { entry: false }, $defs: { entry: {} },
      dependencies: { entry: false, names }, dependentSchemas: { entry: {} },
      prefixItems: [false, {}],
    };
    const before = JSON.parse(JSON.stringify(root));
    if (!mutable) {
      for (const keyword of ["definitions", "$defs", "dependencies", "dependentSchemas", "prefixItems"]) {
        Object.freeze(root[keyword]);
      }
      Object.freeze(root);
    }
    const paths: string[] = [];
    const result = await traverse(root, async (node, _cycle, path, parent) => {
      paths.push(path);
      if (path === "$") return node;
      expect(parent).toEqual(expect.objectContaining({ not: expect.anything() }));
      return typeof node === "boolean" ? { title: path } : false;
    }, { mutable, bfs }) as JSONSchemaObject;
    expect(paths).toHaveLength(11);
    expect(result.not).toEqual({ title: "$.not" });
    expect(result.then).toBe(false);
    expect(result.definitions?.entry).toEqual({ title: "$.definitions.entry" });
    expect(result.$defs.entry).toBe(false);
    expect(result.dependencies?.entry).toEqual({ title: "$.dependencies.entry" });
    expect(result.dependencies?.names).toBe(names);
    expect(result.dependentSchemas.entry).toBe(false);
    expect(result.prefixItems).toEqual([{ title: "$.prefixItems[0]" }, false]);
    expect(result === root).toBe(mutable);
    if (!mutable) expect(root).toEqual(before);
  });

  it.each(["definitions", "$defs", "dependencies", "dependentSchemas", "prefixItems", "not", "if", "then", "else"])(
    "reconnects replacement cycles through %s", keyword => {
      const root: JSONSchemaObject = {};
      root[keyword] = keyword === "prefixItems" ? [root] :
        ["not", "if", "then", "else"].includes(keyword) ? root : { self: root };
      const result = traverse(root, node => ({ ...node as JSONSchemaObject, title: "visited" }), { mutable }) as JSONSchemaObject;
      const backReference = keyword === "prefixItems" ? result[keyword][0] :
        ["not", "if", "then", "else"].includes(keyword) ? result[keyword] : result[keyword].self;
      expect(backReference).toBe(result);
      expect(root.title).toBeUndefined();
    },
  );
});

it.each(["definitions", "$defs", "dependencies", "dependentSchemas"])("preserves special map keys in %s", keyword => {
  const map = JSON.parse('{"__proto__":{},"constructor":false,"a~/b":true}');
  const root: JSONSchemaObject = { [keyword]: map };
  const mutation = jest.fn((node: JSONSchema, _cycle: boolean, path: string) => path === "" ? node : false);
  const result = traverse(root, mutation, { pathFormat: "jsonpointer", skipFirstMutation: true }) as JSONSchemaObject;
  expect(Object.getPrototypeOf(result[keyword])).toBe(Object.prototype);
  expect(Object.keys(result[keyword])).toEqual(["__proto__", "constructor", "a~/b"]);
  expect(Object.getOwnPropertyDescriptor(result[keyword], "__proto__")?.value).toBe(false);
  expect(mutation.mock.calls.map(call => call[2])).toEqual([
    `/${keyword}/__proto__`, `/${keyword}/constructor`, `/${keyword}/a~0~1b`,
  ]);
  expect(map.constructor).toBe(false);
});

it("deduplicates built-in selections without traversing annotation data or references", () => {
  const data = { not: {}, $defs: { hidden: {} } };
  const root: JSONSchemaObject = {
    $defs: { entry: false }, prefixItems: [{}], dependencies: { names: ["x"] },
    default: data, examples: [data], enum: [data], "x-data": data, $ref: "#/$defs/entry",
  };
  const mutation = jest.fn((node: JSONSchema) => node);
  traverse(root, mutation, {
    additionalSubschemas: node => node === root ? [{ path: ["$defs", "entry"] }, { path: ["prefixItems", 0] }] : [],
  });
  expect(mutation).toHaveBeenCalledTimes(3);
  expect(root.default).toBe(data);
});
