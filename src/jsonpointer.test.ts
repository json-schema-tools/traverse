import traverse, { defaultOptions } from "./";
import { jsonPointerStringify } from "./utils";

describe("JSON Pointer callback paths", () => {
  it("formats raw tokens, including escape sequences and empty names", () => {
    expect(jsonPointerStringify([])).toBe("");
    expect(jsonPointerStringify(["properties", "a~/b~1", "items", 0, ""])).toBe("/properties/a~0~1b~01/items/0/");
  });

  it.each([false, true])("formats every visited location with bfs=%s", (bfs) => {
    const paths: string[] = [];
    traverse({
      properties: { "a/b~": { items: { type: "string" } }, "": false },
      patternProperties: { "^a/b$": true },
      anyOf: [{}], allOf: [{}], oneOf: [{}], items: [{}],
      additionalItems: {}, contains: {}, unevaluatedItems: {},
      additionalProperties: {}, propertyNames: {}, unevaluatedProperties: {},
    }, (node, _cycle, path) => {
      paths.push(path);
      return node;
    }, { pathFormat: "jsonpointer", bfs });
    expect(paths.slice().sort()).toEqual([
      "", "/properties/a~1b~0", "/properties/a~1b~0/items", "/properties/",
      "/patternProperties/^a~1b$", "/anyOf/0", "/allOf/0", "/oneOf/0", "/items/0",
      "/additionalItems", "/contains", "/unevaluatedItems", "/additionalProperties",
      "/propertyNames", "/unevaluatedProperties",
    ].sort());
    expect(paths[bfs ? 0 : paths.length - 1]).toBe("");
  });

  it.each([true, false])("formats boolean root %s", (schema) => {
    const mutation = jest.fn((node) => node);
    traverse(schema, mutation, { pathFormat: "jsonpointer" });
    expect(mutation).toHaveBeenCalledWith(schema, false, "", undefined);
    mutation.mockClear();
    traverse(schema, mutation, { pathFormat: "jsonpointer", skipFirstMutation: true });
    expect(mutation).not.toHaveBeenCalled();
  });

  it.each(["properties", "items"])("formats skipped-root cycle edges through %s", (keyword) => {
    const schema: any = {};
    if (keyword === "items") schema.items = schema;
    else schema.properties = { "a/b~": schema };
    const paths: string[] = [];
    traverse(schema, (node, _cycle, path) => {
      paths.push(path);
      return node;
    }, { pathFormat: "jsonpointer", skipFirstMutation: true });
    expect(paths).toEqual([keyword === "items" ? "/items" : "/properties/a~1b~0"]);
  });

  it("keeps JSONPath as the default and explicit alternative", () => {
    expect(defaultOptions.pathFormat).toBe("jsonpath");
    for (const options of [{}, { pathFormat: "jsonpath" as const }]) {
      const paths: string[] = [];
      traverse({ properties: { "a.b": {} } }, (node, _cycle, path) => {
        paths.push(path);
        return node;
      }, options);
      expect(paths).toEqual(['$.properties["a.b"]', "$"]);
    }
  });
});
