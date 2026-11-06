import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("breadth-first traversal with mutable=%s", mutable => {
  it.each([false, true])("visits siblings before grandchildren with async=%s", async asynchronous => {
    const root: JSONSchemaObject = {
      properties: { left: { properties: { leaf: {} } }, right: { items: true } },
    };
    const paths: string[] = [];
    const result = await traverse(root, (node, _cycle, path) => {
      paths.push(path);
      return asynchronous ? Promise.resolve(node) : node;
    }, { bfs: true, mutable });
    expect(paths).toEqual([
      "$", "$.properties.left", "$.properties.right",
      "$.properties.left.properties.leaf", "$.properties.right.items",
    ]);
    expect(result).toEqual(root);
    expect(result === root).toBe(mutable);
  });

  it("uses level order for custom containers, arrays and skipped roots", () => {
    const root = { items: [{ "x-child": {} }, {}], "x-map": { selected: { items: true } } };
    const paths: string[] = [];
    const result = traverse(root, (node, _cycle, path) => { paths.push(path); return node; }, {
      bfs: true, mutable, skipFirstMutation: true,
      additionalSubschemas: node => node["x-map"] ? [{ path: ["x-map", "selected"] }] :
        node["x-child"] ? [{ path: ["x-child"] }] : [],
    });
    expect(paths).toEqual([
      "$.items[0]", "$.items[1]", '$["x-map"].selected',
      '$.items[0]["x-child"]', '$["x-map"].selected.items',
    ]);
    expect(result).toEqual(root);
  });

  it("keeps replacement parents and shared references across levels", () => {
    const shared = { items: true };
    const root = { properties: { left: { items: shared }, right: shared } };
    const paths: string[] = [];
    const parents: JSONSchema[] = [];
    const result = traverse(root, (node, _cycle, path, parent) => {
      paths.push(path);
      parents.push(parent);
      return typeof node === "boolean" ? false : { ...node, title: path };
    }, { bfs: true, mutable }) as JSONSchemaObject;
    expect(paths).toEqual(["$", "$.properties.left", "$.properties.right", "$.properties.right.items"]);
    expect(parents[1]).toBe(result);
    expect(parents[2]).toBe(result);
    expect(parents[3]).toBe(result.properties?.right);
    expect((result.properties?.left as JSONSchemaObject).items).toBe(result.properties?.right);
    expect((result.properties?.right as JSONSchemaObject).items).toBe(false);
  });
});

it("awaits each level's callback before starting the next sibling", async () => {
  let release!: (value: JSONSchema) => void;
  const gate = new Promise<JSONSchema>(resolve => { release = resolve; });
  const paths: string[] = [];
  const root = { properties: { left: { items: true }, right: {} } };
  const result = traverse(root, (node, _cycle, path) => {
    paths.push(path);
    return path === "$.properties.left" ? gate : node;
  }, { bfs: true });
  expect(paths).toEqual(["$", "$.properties.left"]);
  release(root.properties.left);
  await result;
  expect(paths).toEqual(["$", "$.properties.left", "$.properties.right", "$.properties.left.items"]);
});

it("keeps default postorder traversal", () => {
  const paths: string[] = [];
  traverse({ properties: { left: { items: true }, right: {} } }, (node, _cycle, path) => {
    paths.push(path); return node;
  });
  expect(paths).toEqual(["$.properties.left.items", "$.properties.left", "$.properties.right", "$"]);
});

it("drops queued children when a skipped cyclic root becomes a boolean", () => {
  const root: JSONSchemaObject = { properties: {} };
  root.properties = { self: root, other: { items: true } };
  const callback = jest.fn(() => false);
  expect(traverse(root, callback, { bfs: true, skipFirstMutation: true })).toBe(false);
  expect(callback).toHaveBeenCalledTimes(1);
});

it.each([false, true, new Boolean(false)])("treats boolean input %p as a leaf after replacement", root => {
  const selector = jest.fn(() => []);
  const replacement = { items: true };
  expect(traverse(root as JSONSchema, () => replacement, { bfs: true, additionalSubschemas: selector })).toBe(replacement);
  expect(selector).not.toHaveBeenCalled();
});

it("applies separate replacements to repeated boolean values", () => {
  const root = { properties: { first: false, second: false, third: true } };
  const result = traverse(root, (node, _cycle, path) => {
    if (path.endsWith("first")) return true;
    if (path.endsWith("second")) return { title: "second" };
    if (path.endsWith("third")) return false;
    return node;
  }, { bfs: true }) as JSONSchemaObject;
  expect(result.properties).toEqual({ first: true, second: { title: "second" }, third: false });
  expect(root.properties).toEqual({ first: false, second: false, third: true });
});
