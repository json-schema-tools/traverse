import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("merging with mutable=%s", mutable => {
  it.each([false, true])("retains schema keywords and child merges with bfs=%s", async bfs => {
    for (const asynchronous of [false, true]) {
      const child = { type: "string", minLength: 2 };
      const root: JSONSchemaObject = { type: "object", properties: { child } };
      if (!mutable) { Object.freeze(child); Object.freeze(root.properties); Object.freeze(root); }
      const result = await traverse(root, (_node, _cycle, path) => {
        const patch = { title: path };
        return asynchronous ? Promise.resolve(patch) : patch;
      }, { mergeNotMutate: true, mutable, bfs }) as JSONSchemaObject;
      expect(result).toEqual({
        type: "object", title: "$", properties: {
          child: { type: "string", minLength: 2, title: "$.properties.child" },
        },
      });
      expect(result === root).toBe(mutable);
      if (!mutable) {
        expect(root).toEqual({ type: "object", properties: { child: { type: "string", minLength: 2 } } });
        expect(result.properties?.child).not.toBe(child);
      }
    }
  });

  it.each([false, true])("overwrites specified fields with a shallow merge and bfs=%s", bfs => {
    const root: JSONSchemaObject = { type: "string", title: "old", minLength: 2 };
    expect(traverse(root, () => ({ title: "new", minLength: 5 }), {
      mergeNotMutate: true, mutable, bfs,
    })).toEqual({ type: "string", title: "new", minLength: 5 });
  });

  it.each([false, true])("preserves cycles and shared references with bfs=%s", bfs => {
    const root: JSONSchemaObject = {};
    const shared: JSONSchemaObject = { items: root };
    root.properties = { left: shared, right: shared };
    const result = traverse(root, () => ({ title: "merged" }), {
      mergeNotMutate: true, mutable, bfs,
    }) as JSONSchemaObject;
    expect(result.properties?.left).toBe(result.properties?.right);
    expect((result.properties?.left as JSONSchemaObject).items).toBe(result);
    expect((result.properties?.left as JSONSchemaObject).title).toBe("merged");
    expect(result.title).toBe("merged");
    if (!mutable) { expect(root.title).toBeUndefined(); expect(shared.title).toBeUndefined(); }
  });
});

it("keeps replacement as the default", () => {
  const root: JSONSchemaObject = { type: "string", minLength: 2 };
  expect(traverse(root, () => ({ title: "changed" }))).toEqual({ title: "changed" });
  expect(traverse(root, () => ({ title: "changed" }), { mergeNotMutate: false })).toEqual({ title: "changed" });
});

it.each([false, true])("uses replacement when either schema is boolean with bfs=%s", async bfs => {
  for (const replacement of [false, true]) {
    expect(traverse({ items: {} }, () => replacement, { mergeNotMutate: true, bfs })).toBe(replacement);
    expect(traverse(true, () => replacement, { mergeNotMutate: true, bfs })).toBe(replacement);
    expect(await traverse({}, async () => replacement, { mergeNotMutate: true, bfs })).toBe(replacement);
  }
  expect(traverse(false, () => ({ type: "string" }), { mergeNotMutate: true, bfs })).toEqual({ type: "string" });
  const boxed = new Boolean(false) as JSONSchema;
  expect(traverse(boxed, () => ({ title: "replacement" }), { mergeNotMutate: true, bfs })).toEqual({ title: "replacement" });
  expect(traverse({}, () => boxed, { mergeNotMutate: true, bfs })).toBe(boxed);
});

it.each([false, true])("preserves undefined-return handling with bfs=%s", async bfs => {
  expect(() => traverse({}, () => undefined, { mergeNotMutate: true, bfs })).toThrow("returned undefined at $");
  await expect(traverse({}, async () => undefined, { mergeNotMutate: true, bfs })).rejects.toThrow("returned undefined at $");
  expect(traverse({ title: "kept" }, () => undefined, { mergeNotMutate: true, bfs, allowUndefinedReturn: true })).toEqual({ title: "kept" });
  expect(await traverse({ title: "kept" }, async () => undefined, { mergeNotMutate: true, bfs, allowUndefinedReturn: true })).toEqual({ title: "kept" });
});

it("merges own special keys without changing the prototype", () => {
  const patch = JSON.parse('{"__proto__":{"title":"data"},"constructor":false,"toString":true}');
  const root: JSONSchemaObject = { type: "string" };
  const result = traverse(root, () => patch, { mergeNotMutate: true }) as JSONSchemaObject;
  expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
  expect(Object.getOwnPropertyDescriptor(result, "__proto__")?.value).toEqual({ title: "data" });
  expect(result.constructor).toBe(false);
  expect(result.toString).toBe(true);
  expect(result.type).toBe("string");
  expect(Object.prototype.hasOwnProperty.call(root, "__proto__")).toBe(false);
});

it("awaits thenable patches and leaves a schema's then keyword synchronous", async () => {
  const thenable = { then(resolve: (value: JSONSchema) => void) { resolve({ title: "merged" }); } } as any;
  expect(await traverse({ type: "string" }, () => thenable, { mergeNotMutate: true })).toEqual({ type: "string", title: "merged" });
  const result = traverse({ type: "string" }, () => ({ then: {} }), { mergeNotMutate: true });
  expect(result).not.toBeInstanceOf(Promise);
  expect(result).toEqual({ type: "string", then: {} });
});
