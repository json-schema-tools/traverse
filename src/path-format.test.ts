import traverse from "./";
import { jsonPathStringify } from "./utils";

describe("JSONPath formatting", () => {
  it.each(["", ".foo", ".", "[foo]", "a.b", "items[0]", "0", "$", "a b", "a/b", "a~b", "é", "a\"b", "a'b", "a\\b", "a\nb", "\u0000", "^a.b[0]$"])("escapes member %j", (key) => {
    expect(jsonPathStringify(["properties", key])).toBe(`$.properties[${JSON.stringify(key)}]`);
  });

  it("preserves simple names and separates array indices from member names", () => {
    expect(jsonPathStringify([])).toBe("$");
    expect(jsonPathStringify(["properties", "foo", "items", 0, "_bar2"])).toBe("$.properties.foo.items[0]._bar2");
  });

  it.each([false, true])("escapes nested object and boolean schemas with bfs=%s", (bfs) => {
    const paths: string[] = [];
    traverse({ properties: { ".": { properties: { "": false } }, "[foo]": true }, patternProperties: { "^a\\.b$": {} }, items: [{ properties: { "items[0]": {} } }] }, (node, _cycle, path) => {
      paths.push(path);
      return node;
    }, { bfs });
    expect(paths).toEqual(expect.arrayContaining([
      "$", '$.properties["."]', '$.properties["."].properties[""]',
      '$.properties["[foo]"]', '$.patternProperties["^a\\\\.b$"]',
      '$.items[0]', '$.items[0].properties["items[0]"]',
    ]));
    expect(paths).toHaveLength(7);
  });

  it("escapes skipped-root cycle edges", () => {
    const schema: any = { properties: {} };
    schema.properties["a.b"] = schema;
    const paths: string[] = [];
    traverse(schema, (node, _cycle, path) => {
      paths.push(path);
      return node;
    }, { skipFirstMutation: true });
    expect(paths).toEqual(['$.properties["a.b"]']);
  });
});
