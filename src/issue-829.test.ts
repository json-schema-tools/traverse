import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("preorder replacements with mutable=%s", mutable => {
  it.each([false, true])("passes replacement parents with async=%s", async asynchronous => {
    const root = { properties: { child: { items: true } } };
    const parents: Record<string, JSONSchema> = {};
    const replacements: Record<string, JSONSchemaObject> = {};
    const result = await traverse(root, (node, _cycle, path, parent) => {
      parents[path] = parent;
      const replacement = typeof node === "boolean" ? node : { ...node, title: path };
      if (typeof replacement === "object") replacements[path] = replacement;
      return asynchronous ? Promise.resolve(replacement) : replacement;
    }, { bfs: true, mutable }) as JSONSchemaObject;

    expect(result).toBe(replacements.$);
    expect(parents.$).toBeUndefined();
    expect(parents["$.properties.child"]).toBe(result);
    expect(parents["$.properties.child.items"]).toBe(result.properties?.child);
    expect(result.properties?.child).toBe(replacements["$.properties.child"]);
    expect(root).not.toBe(result);
    expect((root as JSONSchemaObject).title).toBeUndefined();
  });

  it.each([false, true])("accepts boolean root replacements with async=%s", async asynchronous => {
    for (const replacement of [false, true]) {
      const root = { properties: { child: { items: true } } };
      const mutation = jest.fn(() => asynchronous ? Promise.resolve(replacement) : replacement);
      expect(await traverse(root, mutation, { bfs: true, mutable })).toBe(replacement);
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(root).toEqual({ properties: { child: { items: true } } });
    }
  });

  it.each([false, true])("stops below a boolean child replacement with async=%s", async asynchronous => {
    const paths: string[] = [];
    const root = { properties: { child: { items: true }, sibling: {} } };
    const result = await traverse(root, (node, _cycle, path) => {
      paths.push(path);
      const replacement = path === "$.properties.child" ? false : node;
      return asynchronous ? Promise.resolve(replacement) : replacement;
    }, { bfs: true, mutable }) as JSONSchemaObject;
    expect(result.properties?.child).toBe(false);
    expect(paths).toEqual(["$", "$.properties.child", "$.properties.sibling"]);
    if (!mutable) expect(root.properties.child).toEqual({ items: true });
  });

  it("passes the returned parent through tuple items and custom containers", () => {
    const root = { items: [{}], "x-map": { child: {} } };
    const parents: JSONSchema[] = [];
    const result = traverse(root, (node, _cycle, path, parent) => {
      if (path === "$") return { title: "replacement" };
      parents.push(parent);
      return node;
    }, {
      bfs: true, mutable,
      additionalSubschemas: node => node["x-map"] ? [{ path: ["x-map", "child"] }] : [],
    }) as JSONSchemaObject;
    expect(parents).toEqual([result, result]);
    expect(parents.every(parent => parent === result)).toBe(true);
    expect(result.items).toEqual([{}]);
    expect(result["x-map"].child).toEqual({});
    expect(root).toEqual({ items: [{}], "x-map": { child: {} } });
  });
});
