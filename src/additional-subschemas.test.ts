import traverse, { AdditionalSubschemas } from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

const extensions: AdditionalSubschemas = node => Object.keys(node)
  .filter(key => key.startsWith("x-"))
  .map(key => ({ path: [key] }));

describe("additionalSubschemas", () => {
  it("is opt-in and recursively combines custom and built-in subschemas", () => {
    const root: JSONSchemaObject = {
      properties: { ordinary: {} },
      "x-extra": { "x-child": { items: { type: "string" } } },
    };
    const paths: string[] = [];
    traverse(root, (node, _cycle, path) => { paths.push(path); return node; });
    expect(paths).toEqual(["$.properties.ordinary", "$"]);
    paths.length = 0;
    traverse(root, (node, _cycle, path) => { paths.push(path); return node; }, {
      additionalSubschemas: extensions,
    });
    expect(paths).toEqual([
      "$.properties.ordinary", '$["x-extra"]["x-child"].items',
      '$["x-extra"]["x-child"]', '$["x-extra"]', "$",
    ]);
  });

  it.each([false, true])("replaces schemas through maps and arrays with mutable=%s", mutable => {
    const leaf = Object.freeze({ type: "string" });
    const root: JSONSchemaObject = { "x-models": { list: [leaf, false], untouched: { data: 1 } } };
    const originalMap = root["x-models"];
    const originalArray = originalMap.list;
    if (!mutable) {
      Object.freeze(originalArray);
      Object.freeze(originalMap);
      Object.freeze(root);
    }
    const result = traverse(root, (node, _cycle, path) => {
      if (path.endsWith("[0]")) return false;
      if (node === false) return { type: "number" };
      return node;
    }, {
      mutable,
      additionalSubschemas: node => node["x-models"] ? [
        { path: ["x-models", "list", 0] }, { path: ["x-models", "list", 1] },
      ] : [],
    }) as JSONSchemaObject;
    expect(result["x-models"].list).toEqual([false, { type: "number" }]);
    expect(result["x-models"].untouched).toBe(originalMap.untouched);
    expect(result === root).toBe(mutable);
    expect(result["x-models"] === originalMap).toBe(mutable);
    expect(result["x-models"].list === originalArray).toBe(mutable);
    if (!mutable) expect(originalArray).toEqual([leaf, false]);
  });

  it.each([false, true])("preserves ordering, parents and root skipping with bfs=%s", bfs => {
    const root: JSONSchemaObject = { "x-container": { child: { items: true } } };
    const calls: Array<[JSONSchema, string, JSONSchema]> = [];
    const result = traverse(root, (node, _cycle, path, parent) => {
      calls.push([node, path, parent]);
      return node;
    }, {
      bfs, skipFirstMutation: true,
      additionalSubschemas: node => node["x-container"] ? [{ path: ["x-container", "child"] }] : [],
    }) as JSONSchemaObject;
    const child = result["x-container"].child;
    expect(calls.map(call => call[1])).toEqual(bfs ? [
      '$["x-container"].child', '$["x-container"].child.items',
    ] : ['$["x-container"].child.items', '$["x-container"].child']);
    expect(calls.find(call => call[1].endsWith(".child"))?.[2]).toBe(result);
    expect(calls.find(call => call[1].endsWith(".items"))?.[2]).toBe(child);
  });

  it("formats literal custom keys in JSON Pointer and ignores prototype properties", () => {
    const root: JSONSchemaObject = { "x/a~b": { "": {} } };
    const mutation = jest.fn((node: JSONSchema) => node);
    traverse(root, mutation, {
      pathFormat: "jsonpointer",
      additionalSubschemas: node => node["x/a~b"] ? [{ path: ["x/a~b", ""] }] : [],
    });
    expect(mutation.mock.calls).toHaveLength(2);
    expect(mutation).toHaveBeenCalledWith({}, false, "/x~1a~0b/", expect.anything());
    expect(() => traverse({}, node => node, {
      additionalSubschemas: () => [{ path: ["__proto__"] }],
    })).toThrow("must be an object or boolean schema");
  });

  it("deduplicates custom, built-in, numeric and string paths", () => {
    const root: JSONSchemaObject = { items: [{}], "x-array": [{}] };
    const mutation = jest.fn((node: JSONSchema) => node);
    const selector = jest.fn((node: Readonly<JSONSchemaObject>) => node === root ? [
      { path: ["items", 0] }, { path: ["items", "0"] },
      { path: ["x-array", 0] }, { path: ["x-array", "0"] },
    ] : []);
    traverse(root, mutation, { additionalSubschemas: selector });
    expect(mutation).toHaveBeenCalledTimes(3);
    expect(selector).toHaveBeenCalledTimes(3);
    expect(selector.mock.calls[0][0]).toBe(root);
  });

  it("forwards overlapping selections through selected ancestors regardless of selector order", () => {
    const root: JSONSchemaObject = {
      properties: { standard: { "x-child": {} } },
      "x-parent": { "x-child": { "x-grandchild": {} } },
    };
    const paths: string[] = [];
    const result = traverse(root, (node, _cycle, path) => {
      paths.push(path);
      return { ...node as JSONSchemaObject, title: path };
    }, {
      additionalSubschemas: node => node === root ? [
        { path: ["properties", "standard", "x-child"] },
        { path: ["x-parent", "x-child", "x-grandchild"] },
        { path: ["x-parent", "x-child"] },
        { path: ["x-parent"] },
      ] : [],
    }) as JSONSchemaObject;
    expect(paths).toEqual([
      '$.properties.standard["x-child"]', "$.properties.standard",
      '$["x-parent"]["x-child"]["x-grandchild"]',
      '$["x-parent"]["x-child"]', '$["x-parent"]', "$",
    ]);
    expect(result["x-parent"]["x-child"]["x-grandchild"].title).toBe(paths[2]);
    expect(root["x-parent"]["x-child"]["x-grandchild"]).toEqual({});
  });

  it("supports readonly path descriptors and skips selectors on boolean schemas", () => {
    const selector: AdditionalSubschemas = () => [{ path: ["x-bool"] as const }] as const;
    expect(traverse({ "x-bool": false }, node => node, { additionalSubschemas: selector })).toEqual({ "x-bool": false });
    const booleanSelector = jest.fn(() => []);
    expect(traverse(true, node => node, { additionalSubschemas: booleanSelector })).toBe(true);
    expect(booleanSelector).not.toHaveBeenCalled();
  });

  it("retains in-place schema edits with allowUndefinedReturn", () => {
    const root: JSONSchemaObject = { "x-child": {} };
    const result = traverse(root, node => { (node as JSONSchemaObject).title = "visited"; }, {
      additionalSubschemas: extensions, allowUndefinedReturn: true,
    }) as JSONSchemaObject;
    expect(result["x-child"].title).toBe("visited");
    expect(root["x-child"]).toEqual({});
  });

  it.each([false, true])("preserves own special keys with mutable=%s", mutable => {
    const root = JSON.parse('{"x-map":{"__proto__":{},"constructor":{},"toString":{}}}');
    const result = traverse(root, (node, _cycle, path) => path === "$" ? node : false, {
      mutable,
      additionalSubschemas: node => node["x-map"] ? Object.keys(node["x-map"])
        .map(key => ({ path: ["x-map", key] })) : [],
    }) as JSONSchemaObject;
    expect(Object.getPrototypeOf(result["x-map"])).toBe(Object.prototype);
    expect(Object.keys(result["x-map"])).toEqual(["__proto__", "constructor", "toString"]);
    expect(Object.getOwnPropertyDescriptor(result["x-map"], "__proto__")?.value).toBe(false);
    if (!mutable) expect(Object.getOwnPropertyDescriptor(root["x-map"], "__proto__")?.value).toEqual({});
  });

  describe.each([false, true])("custom cycles with mutable=%s", mutable => {
    it.each([false, true])("reconnects replacement cycles with bfs=%s", bfs => {
      const root: JSONSchemaObject = {};
      root["x-map"] = { self: root };
      const selector: AdditionalSubschemas = () => [{ path: ["x-map", "self"] }];
      const result = traverse(root, node => ({ ...node as JSONSchemaObject, title: "replacement" }), {
        mutable, bfs, additionalSubschemas: selector,
      }) as JSONSchemaObject;
      expect(result["x-map"].self).toBe(result);
      expect(root["x-map"].self).toBe(root);
      expect(root.title).toBeUndefined();
    });

    it.each([false, true])("retains skipped-root replacements with bfs=%s", bfs => {
      const root: JSONSchemaObject = {};
      root["x-self"] = root;
      const mutation = jest.fn((node: JSONSchema) => ({ ...node as JSONSchemaObject, title: "changed" }));
      const result = traverse(root, mutation, {
        mutable, bfs, skipFirstMutation: true, additionalSubschemas: extensions,
      }) as JSONSchemaObject;
      expect(result["x-self"]).toBe(result);
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(mutation).toHaveBeenCalledWith(expect.anything(), true, '$["x-self"]', expect.anything());
    });
  });

  it("reconnects mutual cycles and shared references through custom paths", () => {
    const root: JSONSchemaObject = { title: "root" };
    const child: JSONSchemaObject = { title: "child", "x-root": root };
    root["x-children"] = [child, child];
    const result = traverse(root, node => ({ ...node as JSONSchemaObject, description: "visited" }), {
      additionalSubschemas: node => node["x-children"] ? [
        { path: ["x-children", 0] }, { path: ["x-children", 1] },
      ] : [{ path: ["x-root"] }],
    }) as JSONSchemaObject;
    expect(result["x-children"][0]).toBe(result["x-children"][1]);
    expect(result["x-children"][0]["x-root"]).toBe(result);
    expect(root["x-children"][0]).toBe(child);
    expect(child["x-root"]).toBe(root);
  });

  it("does not redirect unselected extension data sharing a schema identity", () => {
    const shared = {};
    const root: JSONSchemaObject = { "x-map": { selected: shared, data: shared } };
    const result = traverse(root, (node, _cycle, path) => path === "$" ? node : false, {
      additionalSubschemas: node => node["x-map"] ? [{ path: ["x-map", "selected"] }] : [],
    }) as JSONSchemaObject;
    expect(result["x-map"].selected).toBe(false);
    expect(result["x-map"].data).toBe(shared);
  });

  it("allows mutation to remove a selected location", () => {
    const root: JSONSchemaObject = { "x-child": {} };
    expect(traverse(root, (node, _cycle, path) => path === "$" ? {} : node, {
      additionalSubschemas: extensions,
    })).toEqual({});
  });

  it("discovers built-in children added in place by a mutable preorder callback", () => {
    const root: JSONSchemaObject = {};
    const paths: string[] = [];
    const result = traverse(root, (node, _cycle, path) => {
      paths.push(path);
      if (path === "$") (node as JSONSchemaObject).items = { type: "string" };
      return node;
    }, { mutable: true, bfs: true });
    expect(result).toBe(root);
    expect(paths).toEqual(["$", "$.items"]);
  });

  it("passes the working parent replacement to custom children in preorder", () => {
    const root: JSONSchemaObject = { "x-child": {} };
    let parent: JSONSchema | undefined;
    const result = traverse(root, (node, _cycle, path, parentSchema) => {
      if (path === "$") return { ...node as JSONSchemaObject, title: "replacement" };
      parent = parentSchema;
      return node;
    }, { bfs: true, additionalSubschemas: extensions });
    expect(parent).toBe(result);
    expect((parent as JSONSchemaObject).title).toBe("replacement");
  });

  it.each([false, true])("restores custom containers omitted by preorder replacements with mutable=%s", mutable => {
    const root: JSONSchemaObject = { "x-map": { list: [{ type: "string" }] } };
    const result = traverse(root, (node, _cycle, path) => path === "$" ? { title: "replacement" } : node, {
      mutable, bfs: true,
      additionalSubschemas: node => node["x-map"] ? [{ path: ["x-map", "list", 0] }] : [],
    }) as JSONSchemaObject;
    expect(result).toEqual({ title: "replacement", "x-map": { list: [{ type: "string" }] } });
    expect(result["x-map"]).not.toBe(root["x-map"]);
    expect(root.title).toBeUndefined();
  });

  it.each([null, "bad", [], [null], [-1], [0.5], [Infinity], [Number.MAX_SAFE_INTEGER + 1], new Array(1)])(
    "rejects invalid path %p with the parent location", path => {
      expect(() => traverse({}, node => node, {
        additionalSubschemas: () => [{ path }] as any,
      })).toThrow("Invalid additionalSubschemas path at $");
    },
  );

  it.each([null, "data", 123, [], undefined])("rejects non-schema target %p", value => {
    expect(() => traverse({ "x-child": value }, node => node, {
      additionalSubschemas: extensions,
    })).toThrow('additionalSubschemas target at $["x-child"] must be an object or boolean schema');
  });

  it("rejects missing locations and primitive intermediate containers", () => {
    for (const path of [["missing", "child"], ["title", "child"]]) {
      expect(() => traverse({ title: "data" }, node => node, {
        additionalSubschemas: () => [{ path }],
      })).toThrow("must be an object or boolean schema");
    }
  });
});
