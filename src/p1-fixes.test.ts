import traverse, { TraverseOptions } from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

const modes: Array<[string, TraverseOptions]> = [
  ["immutable DFS", { mutable: false }],
  ["mutable DFS", { mutable: true }],
  ["immutable BFS", { mutable: false, bfs: true }],
  ["mutable BFS", { mutable: true, bfs: true }],
];

describe.each(modes)("P1 fixes in %s", (_name, options) => {
  it("transforms sibling composition and property schemas without dropping constraints", () => {
    const schema: JSONSchemaObject = {
      anyOf: [{ title: "any" }],
      allOf: [{ title: "all" }],
      oneOf: [{ title: "one" }],
      properties: { name: { title: "property" } },
      items: { title: "item" },
    };
    const paths: string[] = [];

    const result = traverse(schema, (node, _isCycle, path) => {
      paths.push(path);
      return path === "$" ? node : { ...node as JSONSchemaObject, description: "visited" };
    }, options) as JSONSchemaObject;

    expect(paths).toHaveLength(6);
    expect(result.anyOf?.[0]).toEqual({ title: "any", description: "visited" });
    expect(result.allOf?.[0]).toEqual({ title: "all", description: "visited" });
    expect(result.oneOf?.[0]).toEqual({ title: "one", description: "visited" });
    expect(result.properties?.name).toEqual({ title: "property", description: "visited" });
    expect(result.items).toEqual({ title: "item", description: "visited" });
  });

  it("uses a boolean replacement for every alias of the same object", () => {
    const shared: JSONSchemaObject = { type: "string" };
    const schema = { properties: { left: shared, right: shared } };
    const mutation = jest.fn((node: JSONSchema) => node === shared ||
      (typeof node === "object" && node.type === "string") ? false : node);

    const result = traverse(schema, mutation, options) as JSONSchemaObject;

    expect(result.properties).toEqual({ left: false, right: false });
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(shared).toEqual({ type: "string" });
  });

  it("preserves own special map keys and ordinary object prototypes", () => {
    const schema: JSONSchemaObject = JSON.parse(
      '{"properties":{"__proto__":{},"constructor":{},"toString":{}},' +
      '"patternProperties":{"__proto__":{},"constructor":{},"toString":{}}}',
    );

    const result = traverse(schema, (node, _isCycle, path) => {
      return path === "$" ? node : { title: "visited" };
    }, options) as JSONSchemaObject;

    for (const keyword of ["properties", "patternProperties"]) {
      expect(Object.getPrototypeOf(result[keyword])).toBe(Object.prototype);
      expect(Object.keys(result[keyword])).toEqual(["__proto__", "constructor", "toString"]);
      for (const key of Object.keys(result[keyword])) {
        expect(Object.getOwnPropertyDescriptor(result[keyword], key)).toEqual({
          value: { title: "visited" }, enumerable: true, writable: true, configurable: true,
        });
      }
    }
  });
});

describe("P1 reference reconnection", () => {
  describe.each([false, true])("skipped immutable root with bfs=%s", (bfs) => {
    it.each(["properties", "items"])("copies the root before an in-place mutation through %s", (keyword) => {
      const root: JSONSchemaObject = {};
      if (keyword === "properties") {
        root.properties = { self: root };
      } else {
        root.items = root;
      }
      const mutation = jest.fn((node: JSONSchema) => {
        (node as JSONSchemaObject).title = "changed";
        return node;
      });

      const result = traverse(root, mutation, {
        mutable: false, skipFirstMutation: true, bfs,
      }) as JSONSchemaObject;

      const path = keyword === "properties" ? "$.properties.self" : "$.items";
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(mutation).toHaveBeenCalledWith(result, true, path, result);
      expect(root.title).toBeUndefined();
      expect(result.title).toBe("changed");
      expect(keyword === "properties" ? result.properties?.self : result.items).toBe(result);
      expect(keyword === "properties" ? root.properties?.self : root.items).toBe(root);
    });
  });

  it.each([false, true])("reconnects replacement self-cycles in property maps with mutable=%s", (mutable) => {
    const root: JSONSchemaObject = {};
    root.properties = { self: root };

    const result = traverse(root, (node) => ({
      ...node as JSONSchemaObject, title: "replacement",
    }), { mutable }) as JSONSchemaObject;

    expect(result.properties?.self).toBe(result);
    expect(result.title).toBe("replacement");
    expect(root.properties?.self).toBe(root);
    expect(root.title).toBeUndefined();
  });

  describe.each([false, true])("composition back-references with mutable=%s", (mutable) => {
    it.each(["anyOf", "allOf", "oneOf"])("reconnects replacements inside %s arrays", (keyword) => {
      const root: JSONSchemaObject = {};
      const children = [root];
      root[keyword] = children;

      const result = traverse(root, (node) => ({
        ...node as JSONSchemaObject, title: "replacement",
      }), { mutable }) as JSONSchemaObject;

      expect(result[keyword][0]).toBe(result);
      expect(result[keyword][0].title).toBe("replacement");
      expect(children[0]).toBe(root);
      expect(root[keyword][0]).toBe(root);
      expect(root.title).toBeUndefined();
    });
  });

  it.each([false, true])("reconnects mutual replacement cycles with mutable=%s", (mutable) => {
    const root: JSONSchemaObject = { title: "root" };
    const child: JSONSchemaObject = { title: "child", items: root };
    root.items = child;

    const result = traverse(root, (node) => ({
      ...node as JSONSchemaObject, description: "visited",
    }), { mutable }) as JSONSchemaObject;
    const resultChild = result.items as JSONSchemaObject;

    expect(resultChild.description).toBe("visited");
    expect(resultChild.items).toBe(result);
    expect(result.description).toBe("visited");
    expect(root.description).toBeUndefined();
    expect(child.description).toBeUndefined();
    if (!mutable) {
      expect(root.items).toBe(child);
      expect(child.items).toBe(root);
    }
  });

  it.each([false, true])("uses a replacement returned for a skipped root cycle with bfs=%s", (bfs) => {
    const root: JSONSchemaObject = {};
    root.items = root;

    const result = traverse(root, (node) => ({
      ...node as JSONSchemaObject, title: "replacement",
    }), { mutable: false, skipFirstMutation: true, bfs }) as JSONSchemaObject;

    expect(result.title).toBe("replacement");
    expect(result.items).toBe(result);
    expect(root.title).toBeUndefined();
    expect(root.items).toBe(root);
  });

  it("keeps replacement identity when a callback deliberately returns the original object", () => {
    const root: JSONSchemaObject = { items: { type: "string" } };

    const result = traverse(root, (node, _isCycle, path) => path === "$" ? root : node);

    expect(result).toBe(root);
  });

  it("does not redirect annotation values that share identity with visited schemas", () => {
    const shared: JSONSchemaObject = { title: "data" };
    const root = { properties: { child: shared }, default: shared };

    const result = traverse(root, (node, _isCycle, path) => {
      return path === "$" ? node : { title: "replacement" };
    }) as JSONSchemaObject;

    expect(result.properties?.child).toEqual({ title: "replacement" });
    expect(result.default).toBe(shared);
    expect(shared).toEqual({ title: "data" });
  });
});
