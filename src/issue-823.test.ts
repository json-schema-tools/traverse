import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("immutable skipped-root cycles with bfs=%s", (bfs) => {
  it.each(["properties", "items"])("mutates the output copy when reached through %s", (keyword) => {
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

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation.mock.calls[0][0]).toBe(result);
    expect(result).not.toBe(root);
    expect(root.title).toBeUndefined();
    expect(result.title).toBe("changed");
    expect(keyword === "properties" ? result.properties?.self : result.items).toBe(result);
    expect(keyword === "properties" ? root.properties?.self : root.items).toBe(root);
  });

  it.each(["properties", "items"])("retains a replacement returned through %s", (keyword) => {
    const root: JSONSchemaObject = {};
    if (keyword === "properties") {
      root.properties = { self: root };
    } else {
      root.items = root;
    }

    const result = traverse(root, (node) => ({
      ...node as JSONSchemaObject, title: "replacement",
    }), { mutable: false, skipFirstMutation: true, bfs }) as JSONSchemaObject;

    expect(result.title).toBe("replacement");
    expect(keyword === "properties" ? result.properties?.self : result.items).toBe(result);
    expect(root.title).toBeUndefined();
    expect(keyword === "properties" ? root.properties?.self : root.items).toBe(root);
  });

  it("retains a boolean replacement for the copied root", () => {
    const root: JSONSchemaObject = {};
    root.items = root;

    const result = traverse(root, () => false, { mutable: false, skipFirstMutation: true, bfs });

    expect(result).toBe(false);
    expect(root.items).toBe(root);
  });
});
