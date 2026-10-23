import traverse, { defaultOptions, MutationFunction, SyncMutationFunction, traverseInternal } from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";
import { runInNewContext } from "node:vm";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const object = (value: JSONSchema): JSONSchemaObject => value as JSONSchemaObject;

describe("conditional async traversal", () => {
  it("completes synchronous callbacks before returning without allocating promises", () => {
    const events: string[] = [];
    const resolve = jest.spyOn(Promise, "resolve");
    const root = { properties: { left: {}, right: {} } };
    const result = traverse(root, (node, _cycle, path) => { events.push(path); return node; });
    expect(events).toEqual(["$.properties.left", "$.properties.right", "$"]);
    expect(result).toEqual(root);
    expect(result).not.toBeInstanceOf(Promise);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("returns a promise for an already-resolved promise and resolves to the root", async () => {
    const replacement = { title: "replacement" };
    const result = traverse({}, () => Promise.resolve(replacement));
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBe(replacement);
  });

  it.each([false, true])("stays synchronous when an async callback is skipped with bfs=%s", bfs => {
    const callback = jest.fn(async (node: JSONSchema) => node);
    expect(traverse(false, callback, { bfs, skipFirstMutation: true })).toBe(false);
    const result = traverse({}, callback, { bfs, skipFirstMutation: true });
    expect(result).toEqual({});
    expect(result).not.toBeInstanceOf(Promise);
    expect(callback).not.toHaveBeenCalled();
  });

  it.each([false, true])("promotes mixed callbacks only when async work is encountered with bfs=%s", async bfs => {
    const mutate: MutationFunction = (node, _cycle, path) => path.includes("async") ? Promise.resolve(false) : node;
    expect(traverse({ properties: { sync: {} } }, mutate, { bfs })).not.toBeInstanceOf(Promise);
    const result = traverse({ properties: { sync: {}, async: {} } }, mutate, { bfs });
    expect(result).toBeInstanceOf(Promise);
    expect(object(await result).properties).toEqual({ sync: {}, async: false });
  });

  it("waits for a child before starting its sibling and gives the parent resolved replacements", async () => {
    const gate = deferred<JSONSchema>();
    const events: string[] = [];
    const replacement = { title: "resolved" };
    const result = traverse({ properties: { left: {}, right: {} } }, (node, _cycle, path) => {
      events.push(path);
      if (path === "$.properties.left") return gate.promise;
      if (path === "$") expect(object(node).properties?.left).toBe(replacement);
      return node;
    });
    expect(events).toEqual(["$.properties.left"]);
    gate.resolve(replacement);
    expect(object(await result).properties?.left).toBe(replacement);
    expect(events).toEqual(["$.properties.left", "$.properties.right", "$"]);
  });

  it("awaits every sibling without invoking the mutator twice", async () => {
    const left = deferred<JSONSchema>();
    const right = deferred<JSONSchema>();
    const rightStarted = deferred<void>();
    const events: string[] = [];
    const result = traverse({ properties: { left: {}, right: {} } }, (node, _cycle, path) => {
      events.push(path);
      if (path.endsWith("left")) return left.promise;
      if (path.endsWith("right")) { rightStarted.resolve(); return right.promise; }
      return node;
    });
    left.resolve(false);
    await rightStarted.promise;
    expect(events).toEqual(["$.properties.left", "$.properties.right"]);
    right.resolve(true);
    expect(object(await result).properties).toEqual({ left: false, right: true });
    expect(events).toEqual(["$.properties.left", "$.properties.right", "$"]);
  });

  it("awaits a preorder parent before discovering children and passes its working replacement", async () => {
    const gate = deferred<JSONSchema>();
    const root: JSONSchemaObject = { properties: { child: {} } };
    const replacement: JSONSchemaObject = { title: "resolved" };
    const selector = jest.fn(() => []);
    const paths: string[] = [];
    const result = traverse(root, (node, _cycle, path, parent) => {
      paths.push(path);
      if (path === "$") return gate.promise;
      expect(parent).toBe(replacement);
      return Promise.resolve(node);
    }, { bfs: true, additionalSubschemas: selector });
    expect(paths).toEqual(["$"]);
    expect(selector).not.toHaveBeenCalled();
    gate.resolve(replacement);
    expect(await result).toBe(replacement);
    expect(paths).toEqual(["$", "$.properties.child"]);
    expect(selector).toHaveBeenCalledTimes(2);
  });

  it("discovers children added after an await by a mutable preorder callback", async () => {
    const root: JSONSchemaObject = {};
    const paths: string[] = [];
    await traverse(root, async (node, _cycle, path) => {
      paths.push(path);
      await Promise.resolve();
      if (path === "$") object(node).items = {};
      return node;
    }, { bfs: true, mutable: true });
    expect(paths).toEqual(["$", "$.items"]);
  });

  describe.each([false, true])("async replacements with mutable=%s", mutable => {
    it.each([false, true])("visits every built-in location with bfs=%s", async bfs => {
      const root: JSONSchemaObject = {
        anyOf: [{}], allOf: [{}], oneOf: [{}], items: [{}, false],
        additionalItems: true, contains: {}, unevaluatedItems: {},
        properties: { child: {} }, patternProperties: { ".*": {} },
        additionalProperties: {}, propertyNames: {}, unevaluatedProperties: {},
      };
      const before = JSON.parse(JSON.stringify(root));
      const paths: string[] = [];
      const result = object(await traverse(root, async (node, _cycle, path) => {
        await Promise.resolve();
        paths.push(path);
        return path === "$" ? node : { title: path };
      }, { mutable, bfs }));
      expect(paths).toHaveLength(14);
      expect(new Set(paths).size).toBe(14);
      expect(paths[bfs ? 0 : paths.length - 1]).toBe("$");
      expect(result.items).toEqual([{ title: "$.items[0]" }, { title: "$.items[1]" }]);
      expect(result.additionalItems).toEqual({ title: "$.additionalItems" });
      expect(result.patternProperties?.[".*"]).toEqual({ title: '$.patternProperties[".*"]' });
      expect(result === root).toBe(mutable);
      if (!mutable) expect(root).toEqual(before);
    });

    it.each([false, true])("handles object items and false replacements with bfs=%s", async bfs => {
      const root: JSONSchemaObject = { items: { properties: { child: {} } } };
      const result = object(await traverse(root, async (node, _cycle, path) => path.endsWith("child") ? false : node, { mutable, bfs }));
      expect(object(result.items as JSONSchema).properties?.child).toBe(false);
      if (!mutable) expect(object(root.items as JSONSchema).properties?.child).toEqual({});
    });

    it.each([false, true])("copies nested custom containers and preserves schema parents with bfs=%s", async bfs => {
      const root: JSONSchemaObject = { "x-map": { schemas: [{ items: false }] } };
      const originalArray = root["x-map"].schemas;
      const parents: JSONSchema[] = [];
      const result = object(await traverse(root, async (node, _cycle, path, parent) => {
        await Promise.resolve();
        if (path !== "$") parents.push(parent);
        if (typeof node === "boolean") return true;
        node.title = path;
        return node;
      }, {
        mutable, bfs,
        additionalSubschemas: node => node["x-map"] ? [
          { path: ["x-map", "schemas", 0] }, { path: ["x-map", "schemas", "0"] },
          // Overlap the built-in items location to verify deduplication.
          { path: ["x-map", "schemas", 0, "items"] },
        ] : [],
      }));
      expect(result["x-map"].schemas[0].items).toBe(true);
      expect(parents).toContain(result);
      expect(parents).toContain(result["x-map"].schemas[0]);
      if (!mutable) {
        expect(root["x-map"].schemas).toBe(originalArray);
        expect(originalArray[0]).toEqual({ items: false });
      }
    });
  });

  it.each([false, true])("handles boolean roots and resolved replacements with bfs=%s", async bfs => {
    for (const root of [false, true]) {
      await expect(traverse(root, async () => false, { bfs })).resolves.toBe(false);
      await expect(traverse(root, async () => ({ type: "string" }), { bfs })).resolves.toEqual({ type: "string" });
    }
  });

  it.each([false, true])("stops children at a preorder boolean replacement with async=%s", async asynchronous => {
    const root: JSONSchemaObject = { properties: { left: {}, right: {} } };
    const mutation = jest.fn(() => asynchronous ? Promise.resolve(false) : false);
    expect(await traverse(root, mutation, { bfs: true })).toBe(false);
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  describe.each([false, true])("async cycles with mutable=%s", mutable => {
    it.each([false, true])("reconnects self-cycles without deadlocking with bfs=%s", async bfs => {
      const root: JSONSchemaObject = {};
      root.items = root;
      const mutation = jest.fn(async (node: JSONSchema) => ({ ...object(node), title: "replacement" }));
      const result = object(await traverse(root, mutation, { mutable, bfs }));
      expect(result.items).toBe(result);
      expect(result.title).toBe("replacement");
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(root.items).toBe(root);
    });

    it.each([false, true])("reconnects mutual custom cycles with bfs=%s", async bfs => {
      const root: JSONSchemaObject = {};
      const child: JSONSchemaObject = { "x-root": root };
      root["x-child"] = child;
      const mutation = jest.fn(async (node: JSONSchema) => ({ ...object(node), title: "visited" }));
      const result = object(await traverse(root, mutation, {
        mutable, bfs,
        additionalSubschemas: node => Object.keys(node).filter(key => key.startsWith("x-")).map(key => ({ path: [key] })),
      }));
      expect(result["x-child"]["x-root"]).toBe(result);
      expect(mutation).toHaveBeenCalledTimes(2);
      if (!mutable) expect(child["x-root"]).toBe(root);
    });

    it.each([false, true])("waits for skipped-root cycle replacements with bfs=%s", async bfs => {
      const root: JSONSchemaObject = {};
      root.properties = { self: root };
      const mutation = jest.fn(async (node: JSONSchema) => ({ ...object(node), title: "resolved" }));
      const result = object(await traverse(root, mutation, { mutable, bfs, skipFirstMutation: true }));
      expect(result.properties?.self).toBe(result);
      expect(result.title).toBe("resolved");
      expect(mutation).toHaveBeenCalledTimes(1);
      expect(mutation).toHaveBeenCalledWith(expect.anything(), true, "$.properties.self", expect.anything());
    });

    it.each([false, true])("preserves resolved shared object identity with bfs=%s", async bfs => {
      const shared = { type: "string" };
      const root: JSONSchemaObject = { properties: { left: shared, right: shared } };
      const mutation = jest.fn(async (node: JSONSchema) => ({ ...object(node), title: "resolved" }));
      const result = object(await traverse(root, mutation, { mutable, bfs }));
      expect(result.properties?.left).toBe(result.properties?.right);
      expect(object(result.properties?.left as JSONSchema).title).toBe("resolved");
      expect(mutation).toHaveBeenCalledTimes(2);
    });
  });

  it("propagates a resolved false replacement through shared references", async () => {
    const shared = {};
    const result = object(await traverse({ properties: { left: shared, right: shared } }, async (node, _cycle, path) => path === "$" ? node : false));
    expect(result.properties).toEqual({ left: false, right: false });
  });

  it("retains an async false replacement of a skipped cyclic root", async () => {
    const root: JSONSchemaObject = {};
    root.items = root;
    await expect(traverse(root, async () => false, { skipFirstMutation: true })).resolves.toBe(false);
    expect(root.items).toBe(root);
  });

  it.each([false, true])("applies allowUndefinedReturn after resolution with bfs=%s", async bfs => {
    const root: JSONSchemaObject = { properties: { child: false } };
    await expect(traverse(root, async () => {}, { bfs })).rejects.toThrow("returned undefined at");
    const result = object(await traverse(root, async node => {
      await Promise.resolve();
      if (typeof node === "object") node.title = "visited";
    }, { bfs, allowUndefinedReturn: true }));
    expect(result.title).toBe("visited");
    expect(result.properties?.child).toBe(false);
    expect(root.title).toBeUndefined();
  });

  it("reports the exact path of an async undefined return", async () => {
    await expect(traverse({ properties: { child: {} } }, async () => {})).rejects.toThrow("undefined at $.properties.child");
  });

  it("rejects a synchronous undefined return after an async child", async () => {
    await expect(traverse({ items: {} }, (node, _cycle, path) =>
      path === "$.items" ? Promise.resolve(node) : undefined,
    )).rejects.toThrow("undefined at $");
  });

  it("keeps frozen input untouched when resolving immutable replacements", async () => {
    const child = Object.freeze({ type: "string" });
    const properties = Object.freeze({ child });
    const root = Object.freeze({ properties });
    const result = object(await traverse(root, async node => ({ ...object(node), title: "visited" })));
    expect(result.properties?.child).toEqual({ type: "string", title: "visited" });
    expect(root).toEqual({ properties: { child: { type: "string" } } });
    expect(result.properties).not.toBe(properties);
  });

  it("rejects child selection errors following an awaited preorder callback", async () => {
    const mutation = jest.fn(async (node: JSONSchema) => node);
    await expect(traverse({}, mutation, {
      bfs: true, additionalSubschemas: () => [{ path: ["missing"] }],
    })).rejects.toThrow("missing");
    expect(mutation).toHaveBeenCalledTimes(1);
  });

  it("throws synchronous errors before encountering any promise", () => {
    const error = new Error("sync failure");
    expect(() => traverse({}, () => { throw error; })).toThrow(error);
    expect(() => traverse({}, () => undefined)).toThrow("undefined at $");
  });

  it("rejects later synchronous failures after a promise and does not visit later siblings", async () => {
    const error = new Error("later failure");
    const paths: string[] = [];
    const result = traverse({ properties: { first: {}, second: {}, third: {} } }, (node, _cycle, path) => {
      paths.push(path);
      if (path.endsWith("first")) return Promise.resolve(node);
      throw error;
    });
    await expect(result).rejects.toBe(error);
    expect(paths).toEqual(["$.properties.first", "$.properties.second"]);
  });

  it("rejects callback promises and never invokes pending parents or siblings", async () => {
    const gate = deferred<JSONSchema>();
    const error = new Error("rejected");
    const callback = jest.fn(() => gate.promise);
    const result = traverse({ properties: { first: {}, second: {} } }, callback);
    const rejection = expect(result).rejects.toBe(error);
    gate.reject(error);
    await rejection;
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("rejects a preorder promise before child discovery", async () => {
    const selector = jest.fn(() => []);
    const error = new Error("parent rejected");
    await expect(traverse({ items: {} }, () => Promise.reject(error), {
      bfs: true, additionalSubschemas: selector,
    })).rejects.toBe(error);
    expect(selector).not.toHaveBeenCalled();
  });

  it("does not roll back mutable edits completed before an async failure", async () => {
    const root: JSONSchemaObject = { properties: { first: {}, second: {} } };
    await expect(traverse(root, async (node, _cycle, path) => {
      if (path.endsWith("second")) throw new Error("failed");
      object(node).title = "done";
      return node;
    }, { mutable: true })).rejects.toThrow("failed");
    expect(object(root.properties?.first as JSONSchema).title).toBe("done");
    expect(root.title).toBeUndefined();
  });

  it("does not dereference payload $refs", async () => {
    const root = { items: { $ref: "#" } };
    const callback = jest.fn(async (node: JSONSchema) => node);
    expect(await traverse(root, callback)).toEqual(root);
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("keeps escaped callback paths after suspending", async () => {
    const paths: string[] = [];
    await traverse({ properties: { "a~/b": false } }, async (node, _cycle, path) => { paths.push(path); return node; }, { pathFormat: "jsonpointer" });
    expect(paths).toEqual(["/properties/a~0~1b", ""]);
  });

  it("assimilates foreign promises and object/function thenables", async () => {
    const foreign = runInNewContext("Promise.resolve(false)") as PromiseLike<JSONSchema>;
    await expect(traverse({}, () => foreign)).resolves.toBe(false);
    const thenable = { then(resolve: (value: JSONSchema) => void) { resolve(false); } } as any;
    await expect(traverse({}, () => thenable)).resolves.toBe(false);
    const callable = Object.assign(() => {}, { then(resolve: (value: JSONSchema) => void) { resolve(true); } }) as any;
    await expect(traverse({}, () => callable)).resolves.toBe(true);
  });

  it("uses standard promise settlement rules for misbehaving thenables", async () => {
    const thenable = { then(resolve: (value: JSONSchema) => void, reject: (reason: unknown) => void) {
      resolve(false); reject(new Error("ignored")); resolve(true);
    } } as any;
    await expect(traverse({}, () => thenable)).resolves.toBe(false);
    const error = new Error("then failed");
    await expect(traverse({}, () => ({ then() { throw error; } }) as any)).rejects.toBe(error);
  });

  it("propagates throwing then getters according to whether traversal has suspended", async () => {
    const error = new Error("then getter failed");
    const bad = { get then() { throw error; } } as any;
    expect(() => traverse({}, () => bad)).toThrow(error);
    await expect(traverse({ items: {} }, (node, _cycle, path) =>
      path === "$.items" ? Promise.resolve(node) : bad,
    )).rejects.toBe(error);
  });

  it("does not interpret the JSON Schema then keyword as async work", () => {
    const node: JSONSchemaObject = { then: { type: "string" } };
    expect(traverse({}, () => node)).toBe(node);
    // Invalid JavaScript callback values retain the prior behavior without
    // promise detection introducing a null-property access error.
    expect(traverse(true, () => null as any)).toBeNull();
  });

  it("allows independent traversals to interleave without sharing state", async () => {
    const left = deferred<JSONSchema>();
    const right = deferred<JSONSchema>();
    const leftResult = traverse({ items: {} }, (node, _cycle, path) => path === "$.items" ? left.promise : node);
    const rightResult = traverse({ items: {} }, (node, _cycle, path) => path === "$.items" ? right.promise : node);
    right.resolve(false);
    expect(object(await rightResult).items).toBe(false);
    left.resolve(true);
    expect(object(await leftResult).items).toBe(true);
  });

  it("supports explicit internal traversal state without creating a nested driver", async () => {
    const result = traverseInternal({}, async node => node, defaultOptions, 0, [], [], [], [], [], new Map(), new Map(), []);
    await expect(result).resolves.toEqual({});
  });

  it("preserves synchronous and promise-capable TypeScript return types", async () => {
    type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
    const sync = traverse({}, node => node);
    const syncCallback: SyncMutationFunction = node => node;
    const annotated = traverse({}, syncCallback);
    expect(sync).toEqual({});
    expect(annotated).toEqual({});
    const asynchronous = traverse({}, async node => node);
    const mixed = traverse({}, (node, _cycle, path) => path === "$" ? Promise.resolve(node) : node);
    const observer = traverse({}, async () => {}, { allowUndefinedReturn: true });
    const types: [Equal<typeof sync, JSONSchema>, Equal<typeof annotated, JSONSchema>,
      Equal<typeof asynchronous, JSONSchema | Promise<JSONSchema>>,
      Equal<typeof mixed, JSONSchema | Promise<JSONSchema>>,
      Equal<typeof observer, JSONSchema | Promise<JSONSchema>>] = [true, true, true, true, true];
    expect(types).toEqual([true, true, true, true, true]);
    await asynchronous;
    await mixed;
    await observer;
  });
});
