import traverse from "./";

describe("traverse with path", () => {
  it("traverse empty schema", () => {
    const testSchema = {};
    const pathArray: string[] = [];
    const mockMutation = jest.fn((s, path) => {
      pathArray.push(path);
      return s;
    });

    traverse(testSchema, mockMutation);

    expect(pathArray).toEqual(["$"]);
  });

  it("traverse 1 level subschema", () => {
    const testSchema = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { type: "number" }
      }
    };
    const pathArray: string[] = [];
    const mockMutation = jest.fn((s, path) => {
      pathArray.push(path);
      return s;
    });

    traverse(testSchema, mockMutation);

    expect(pathArray).toEqual(["$.properties.foo", "$.properties.bar", "$" ]);
  });

  it("traverse bfs schema", () => {
    const testSchema = {
      type: "object",
      properties: {
        foo: {
          type: "object",
          properties: {
            fooNoBar: { type: "string" }
          }
        },
        bar: { type: "number" }
      }
    }
    const pathArray: string[] = [];
    const mockMutation = jest.fn((s, path) => {
      pathArray.push(path);
      return s;
    });

    traverse(testSchema, mockMutation);

    expect(pathArray).toEqual(["$.properties.foo.properties.fooNoBar", "$.properties.foo", "$.properties.bar", "$"]);
  });
});
