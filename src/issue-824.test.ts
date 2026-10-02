import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("DFS replacements with mutable=%s", (mutable) => {
  it("preserves object replacements on every shared reference", () => {
    const shared: JSONSchemaObject = { type: "string" };
    const root = { properties: { left: shared, right: shared } };

    const result = traverse(root, (node, _isCycle, path) => path === "$" ? node : {
      ...node as JSONSchemaObject, title: "changed",
    }, { mutable }) as JSONSchemaObject;

    expect(result.properties?.left).toEqual({ type: "string", title: "changed" });
    expect(result.properties?.right).toBe(result.properties?.left);
    expect(shared).toEqual({ type: "string" });
  });

  it("uses a boolean replacement for every shared reference", () => {
    const shared: JSONSchemaObject = { type: "string" };
    const root = { properties: { left: shared, right: shared } };
    const mutation = jest.fn((node: JSONSchema) => typeof node === "object" &&
      node.type === "string" ? false : node);

    const result = traverse(root, mutation, { mutable }) as JSONSchemaObject;

    expect(result.properties).toEqual({ left: false, right: false });
    expect(mutation).toHaveBeenCalledTimes(2);
    expect(shared).toEqual({ type: "string" });
  });

  it.each(["properties", "items"])("reconnects replacement self-cycles through %s", (keyword) => {
    const root: JSONSchemaObject = {};
    if (keyword === "properties") {
      root.properties = { self: root };
    } else {
      root.items = root;
    }

    const result = traverse(root, (node) => ({
      ...node as JSONSchemaObject, title: "replacement",
    }), { mutable }) as JSONSchemaObject;

    expect(keyword === "properties" ? result.properties?.self : result.items).toBe(result);
    expect(result.title).toBe("replacement");
    expect(keyword === "properties" ? root.properties?.self : root.items).toBe(root);
    expect(root.title).toBeUndefined();
  });

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

  it("reconnects mutual replacement cycles", () => {
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
});

it("keeps identity when a callback deliberately returns the original object", () => {
  const root: JSONSchemaObject = { items: { type: "string" } };
  expect(traverse(root, (node, _isCycle, path) => path === "$" ? root : node)).toBe(root);
});

it("does not redirect annotation values that share identity with visited schemas", () => {
  const shared: JSONSchemaObject = { title: "data" };
  const root = { properties: { child: shared }, default: shared };

  const result = traverse(root, (node, _isCycle, path) => path === "$" ? node : {
    title: "replacement",
  }) as JSONSchemaObject;

  expect(result.properties?.child).toEqual({ title: "replacement" });
  expect(result.default).toBe(shared);
  expect(shared).toEqual({ title: "data" });
});
