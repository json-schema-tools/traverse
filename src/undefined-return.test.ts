import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

// Callbacks intentionally omit returns to exercise JavaScript observer behavior.
describe.each([false, true])("undefined callback returns with bfs=%s", (bfs) => {
  it.each([undefined, false])("rejects a missing return with allowUndefinedReturn=%s", (allowUndefinedReturn) => {
    const schema = { properties: { child: { type: "string" } } };
    expect(() => traverse(schema, (node, _cycle, path) => {
      if (path === "$") { return node; }
    }, { bfs, allowUndefinedReturn })).toThrow(
      "Traversal callback returned undefined at $.properties.child; return a schema or set allowUndefinedReturn: true.",
    );
  });

  it("retains every node in the reported two-array example", () => {
    const array = () => ({ type: "array", items: {
      type: "object", properties: { text: { type: "string" }, language: { type: "string" } },
    } });
    const schema = { properties: { titles: array(), acronyms: array() } };
    const paths: string[] = [];
    const result = traverse(schema, (_node, _cycle, path) => { paths.push(path); }, {
      bfs, allowUndefinedReturn: true,
    }) as JSONSchemaObject;
    expect(result).toEqual(schema);
    expect(result).not.toBe(schema);
    expect(paths).toHaveLength(9);
    expect(new Set(paths).size).toBe(9);
    expect(paths).toContain("$.properties.acronyms.items.properties.language");
    expect(result.properties?.titles).not.toBe(schema.properties.titles);
  });

  it.each([false, true])("retains in-place edits with mutable=%s", (mutable) => {
    const schema: JSONSchemaObject = { properties: { child: { type: "string" } } };
    const result = traverse(schema, (node) => {
      (node as JSONSchemaObject).title = "visited";
    }, { bfs, mutable, allowUndefinedReturn: true }) as JSONSchemaObject;
    expect(result.title).toBe("visited");
    expect((result.properties?.child as JSONSchemaObject).title).toBe("visited");
    if (mutable) {
      expect(result).toBe(schema);
    } else {
      expect(result).not.toBe(schema);
      expect(schema.title).toBeUndefined();
      expect((schema.properties?.child as JSONSchemaObject).title).toBeUndefined();
    }
  });

  it.each([true, false])("keeps boolean schema %s", (schema) => {
    expect(traverse(schema, () => {}, { bfs, allowUndefinedReturn: true })).toBe(schema);
    expect(() => traverse(schema, () => {}, { bfs })).toThrow(TypeError);
    expect(traverse({ properties: { child: schema } }, () => {}, {
      bfs, allowUndefinedReturn: true,
    })).toEqual({ properties: { child: schema } });
  });

  it.each([false, true])("preserves explicit false replacements with allowUndefinedReturn=%s", (allowUndefinedReturn) => {
    expect(traverse({}, () => false, { bfs, allowUndefinedReturn })).toBe(false);
    expect(traverse(true, () => false, { bfs, allowUndefinedReturn })).toBe(false);
  });

  it("preserves explicit object replacements", () => {
    const replacement = { title: "replacement" };
    expect(traverse({}, () => replacement, { bfs, allowUndefinedReturn: true })).toBe(replacement);
  });

  it.each(["properties", "items"])("keeps skipped-root cycles through %s", (keyword) => {
    const schema: JSONSchemaObject = {};
    if (keyword === "properties") { schema.properties = { self: schema }; }
    else { schema.items = schema; }
    const callback = jest.fn((node: JSONSchema) => { (node as JSONSchemaObject).title = "visited"; });
    const result = traverse(schema, callback, {
      bfs, skipFirstMutation: true, allowUndefinedReturn: true,
    }) as JSONSchemaObject;
    expect(callback).toHaveBeenCalledTimes(1);
    expect(result.title).toBe("visited");
    expect(keyword === "properties" ? result.properties?.self : result.items).toBe(result);
    expect(schema.title).toBeUndefined();
    expect(() => traverse(schema, () => {}, { bfs, skipFirstMutation: true })).toThrow(
      keyword === "properties" ? "undefined at $.properties.self" : "undefined at $.items",
    );
  });

  it("keeps ordinary self-cycles and shared nodes", () => {
    const shared = { type: "string" };
    const schema: JSONSchemaObject = { properties: { left: shared, right: shared } };
    schema.items = schema;
    const result = traverse(schema, () => {}, { bfs, allowUndefinedReturn: true }) as JSONSchemaObject;
    expect(result.items).toBe(result);
    expect(result.properties?.left).toBe(result.properties?.right);
    expect(result.properties?.left).not.toBe(shared);
  });

  it("does not invoke a callback on a skipped root without children", () => {
    const callback = jest.fn(() => {});
    expect(traverse({}, callback, { bfs, skipFirstMutation: true })).toEqual({});
    expect(traverse(false, callback, { bfs, skipFirstMutation: true })).toBe(false);
    expect(callback).not.toHaveBeenCalled();
  });
});
