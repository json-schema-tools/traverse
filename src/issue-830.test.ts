import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("preorder cycle flags with mutable=%s", mutable => {
  it.each(["properties", "items", "anyOf"])("reports a self-cycle through %s before mutation", async keyword => {
    const root: JSONSchemaObject = {};
    root[keyword] = keyword === "properties" ? { self: root } : keyword === "items" ? root : [root];
    const calls: Array<[boolean, string]> = [];
    const result = await traverse(root, async (node, cycle, path) => {
      calls.push([cycle, path]);
      return { ...node as JSONSchemaObject, title: "replacement" };
    }, { bfs: true, mutable }) as JSONSchemaObject;
    expect(calls).toEqual([[true, "$"]]);
    expect(keyword === "properties" ? result.properties?.self : keyword === "items" ? result.items : result.anyOf?.[0]).toBe(result);
    expect(root.title).toBeUndefined();
  });

  it("identifies a nested cycle root without marking an acyclic ancestor", () => {
    const child: JSONSchemaObject = {};
    child.items = child;
    const root = { properties: { child } };
    const calls: Array<[boolean, string]> = [];
    traverse(root, (node, cycle, path) => { calls.push([cycle, path]); return node; }, { bfs: true, mutable });
    expect(calls).toEqual([[false, "$"], [true, "$.properties.child"]]);
  });

  it("distinguishes a mutual cycle from a shared DAG", () => {
    const root: JSONSchemaObject = {};
    const child: JSONSchemaObject = { items: root };
    root.items = child;
    const cycles: boolean[] = [];
    traverse(root, (node, cycle) => { cycles.push(cycle); return node; }, { bfs: true, mutable });
    expect(cycles).toEqual([true, false]);
    const shared = { items: true };
    const flags: boolean[] = [];
    traverse({ properties: { left: shared, right: shared } }, (node, cycle) => {
      flags.push(cycle); return node;
    }, { bfs: true, mutable });
    expect(flags).toEqual([false, false, false]);
  });

  it("keeps the skipped-root reference path and true cycle flag", () => {
    const root: JSONSchemaObject = {};
    root.items = root;
    const mutation = jest.fn((node: JSONSchema) => node);
    traverse(root, mutation, { bfs: true, mutable, skipFirstMutation: true });
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(mutation).toHaveBeenCalledWith(expect.anything(), true, "$.items", expect.anything());
  });
});

it.each(["jsonpath", "jsonpointer"] as const)("handles literal map names in %s", pathFormat => {
  const child: JSONSchemaObject = {};
  child.items = child;
  const root = { properties: { 'a~/b["c"]': child } };
  const mutation = jest.fn((node: JSONSchema) => node);
  traverse(root, mutation, { bfs: true, pathFormat });
  expect(mutation).toHaveBeenNthCalledWith(2, expect.anything(), true,
    pathFormat === "jsonpointer" ? '/properties/a~0~1b["c"]' : `$.properties[${JSON.stringify('a~/b["c"]')}]`,
    expect.anything());
});

it("does not discover cycles in annotations or follow reference strings", () => {
  const root: JSONSchemaObject = { $ref: "#" };
  root.default = root;
  root.examples = [root];
  const callback = jest.fn((node: JSONSchema) => node);
  traverse(root, callback, { bfs: true });
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith(expect.anything(), false, "$", undefined);
});
