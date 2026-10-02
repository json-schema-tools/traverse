import traverse from "./";
import { JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("special map keys with mutable=%s", (mutable) => {
  it.each([false, true])("preserves own data properties with bfs=%s", (bfs) => {
    const schema: JSONSchemaObject = JSON.parse(
      '{"properties":{"__proto__":{},"constructor":{},"toString":{}},' +
      '"patternProperties":{"__proto__":{},"constructor":{},"toString":{}}}',
    );

    const result = traverse(schema, (node, _isCycle, path) => path === "$" ? node : {
      title: "visited",
    }, { mutable, bfs }) as JSONSchemaObject;

    for (const keyword of ["properties", "patternProperties"]) {
      expect(Object.getPrototypeOf(result[keyword])).toBe(Object.prototype);
      expect(Object.keys(result[keyword])).toEqual(["__proto__", "constructor", "toString"]);
      for (const key of Object.keys(result[keyword])) {
        expect(Object.getOwnPropertyDescriptor(result[keyword], key)).toEqual({
          value: { title: "visited" }, enumerable: true, writable: true, configurable: true,
        });
      }
    }
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    if (!mutable) {
      expect(schema.properties?.__proto__).toEqual({});
      expect(Object.getPrototypeOf(schema.properties)).toBe(Object.prototype);
    }
  });
});
