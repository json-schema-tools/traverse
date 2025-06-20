import traverse from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse cycle detection", () => {
  it("handles basic cycles", () => {
    const schema = { type: "object", properties: { foo: {} } };
    schema.properties.foo = schema;
    const mockMutation = jest.fn((s) => s);
    traverse(schema as JSONSchema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(1);
  });

  it("does not follow $refs", () => {
    const schema = { type: "object", properties: { foo: { $ref: "#" } } } as JSONSchema;
    const mockMutation = jest.fn((s) => s);
    traverse(schema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(2);
  });

  it("handles chained cycles", () => {
    const schema = {
      title: "1",
      type: "object",
      properties: {
        foo: {
          title: "2",
          items: [
            {
              title: "3",
              type: "array",
              items: { title: "4" },
            },
          ],
        },
      },
    };
    schema.properties.foo.items[0].items = schema;
    const mockMutation = jest.fn((s) => s);
    traverse(schema as JSONSchema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(3);
  });

  it("handles chained cycles where the cycle starts in the middle", () => {
    const schema = {
      title: "1",
      type: "object",
      properties: {
        foo: {
          title: "2",
          anyOf: [
            {
              title: "3",
              type: "array",
              items: {
                title: "4",
                properties: {
                  baz: { title: "5" },
                },
              },
            },
          ],
        },
      },
    };
    schema.properties.foo.anyOf[0].items.properties.baz = schema.properties.foo;
    const mockMutation = jest.fn((s) => s);
    traverse(schema as JSONSchema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(4);
  });

  it("handles chained cycles where the cycle starts in the middle of a different branch of the tree", () => {
    const schema = {
      title: "1",
      type: "object",
      properties: {
        foo: {
          title: "2",
          anyOf: [
            {
              title: "3",
              type: "array",
              items: {
                title: "4",
                properties: {
                  baz: { title: "5" },
                },
              },
            },
          ],
        },
        bar: {
          title: "6",
          type: "object",
          allOf: [
            { title: "7", type: "object", properties: { baz: { title: "8" } } },
          ],
        },
      },
    };
    schema.properties.foo.anyOf[0].items.properties.baz = schema;
    schema.properties.bar.allOf[0].properties.baz = schema.properties.foo.anyOf[0];
    const mockMutation = jest.fn((s) => s);
    traverse(schema as JSONSchema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(6);
  });

  it("handles multiple cycles", () => {
    const schema: any = {
      title: "1",
      type: "object",
      properties: {
        foo: {
          title: "2",
          anyOf: [
            {
              title: "3",
              type: "array",
              items: {
                title: "4",
                properties: {
                  baz: { title: "5" },
                },
              },
            },
          ],
        },
        bar: {
          title: "6",
          type: "object",
          allOf: [
            { title: "7", type: "object", properties: { baz: { title: "5" } } },
          ],
        },
      },
    };
    schema.properties.bar.allOf[0].properties.baz = schema.properties.foo.anyOf[0].items.properties.baz;
    schema.properties.bar.allOf.push(schema); // should not add any calls
    schema.properties.bar.allOf.push(schema.properties.foo.anyOf[0].items); // should not add any calls
    const mockMutation = jest.fn((s) => s);
    traverse(schema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(7);
  });

  it("returned mutated schema has circ refs back to the mutated schema instead of original", () => {
    const schema: any = {
      title: "2",
      type: "object",
      properties: {
        foo: {
          $ref: "#"
        },
      },
    };
    const result = traverse(schema, (s: JSONSchema) => {
      if ((s as JSONSchemaObject).$ref) { return schema; }
      return s;
    }, { mutable: true }) as JSONSchemaObject;

    const rProps = result.properties as Properties;
    expect(rProps.foo).toBe(result);
  });

  it("handles the mutation function adding a cycle", () => {
    const schema = {
      title: "1",
      type: "object",
      properties: {
        foo: {
          title: "2",
          anyOf: [
            {
              title: "3",
              type: "array",
              items: {
                title: "4",
                properties: {
                  baz: { title: "5" },
                },
              },
            },
          ],
        },
      },
    };
    schema.properties.foo.anyOf[0].items.properties.baz = schema.properties.foo;
    const mockMutation = jest.fn((s) => s);
    traverse(schema as JSONSchema, mockMutation);
    expect(mockMutation).toHaveBeenCalledTimes(4);
  });

});
