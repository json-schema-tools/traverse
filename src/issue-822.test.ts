import traverse from "./";
import { JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("sibling keywords with mutable=%s", (mutable) => {
  it.each([false, true])("visits every sibling subschema with bfs=%s", (bfs) => {
    const schema: JSONSchemaObject = {
      anyOf: [{ title: "any" }],
      allOf: [{ title: "all" }],
      oneOf: [{ title: "one" }],
      properties: { name: { title: "property" } },
      items: { title: "item" },
    };
    const paths: string[] = [];

    const result = traverse(schema, (node, _isCycle, path) => {
      paths.push(path);
      return path === "$" ? node : { ...node as JSONSchemaObject, description: "visited" };
    }, { mutable, bfs }) as JSONSchemaObject;

    expect(paths).toHaveLength(6);
    expect(paths).toEqual(expect.arrayContaining([
      "$", "$.anyOf[0]", "$.allOf[0]", "$.oneOf[0]", "$.properties.name", "$.items",
    ]));
    expect(paths[bfs ? 0 : paths.length - 1]).toBe("$");
    expect(result.anyOf?.[0]).toEqual({ title: "any", description: "visited" });
    expect(result.allOf?.[0]).toEqual({ title: "all", description: "visited" });
    expect(result.oneOf?.[0]).toEqual({ title: "one", description: "visited" });
    expect(result.properties?.name).toEqual({ title: "property", description: "visited" });
    expect(result.items).toEqual({ title: "item", description: "visited" });
    if (!mutable) {
      expect(schema.properties?.name).toEqual({ title: "property" });
      expect(schema.anyOf?.[0]).toEqual({ title: "any" });
    }
  });
});
