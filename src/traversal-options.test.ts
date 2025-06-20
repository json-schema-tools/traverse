import traverse, { MutationFunction } from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";
import { testCalls } from "./test-utils";

describe("traverse options", () => {
  describe("skipFirstMutation", () => {
    it("skips the first schema when the option skipFirstMutation is true", () => {
      const testSchema: any = { anyOf: [{}, {}] };
      const mockMutation = jest.fn((s) => s);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      testCalls(mockMutation, testSchema.anyOf[0]);
      testCalls(mockMutation, testSchema.anyOf[1]);
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("skips first mutation when schema is a bool", () => {
      const testSchema: any = true;
      const mockMutation = jest.fn((s) => s);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      expect(mockMutation).not.toHaveBeenCalledWith(testSchema, expect.any, expect.any);
      expect(mockMutation).toHaveBeenCalledTimes(0);
    });

    it("When the 2nd schema down is a cycle to its parent, the mutation function is called regardless", () => {
      const schema1: any = {
        title: "skipFirstCycles",
        type: "object",
        properties: { skipFirstCycle: {} }
      };
      const schema2: any = {
        title: "skipFirstCycles",
        type: "object",
        items: {}
      };
      schema1.properties.skipFirstCycle = schema1;
      schema2.items = schema2;

      const mut1 = jest.fn((s) => s);
      traverse(schema1, mut1, { skipFirstMutation: true, mutable: true }) as JSONSchemaObject;

      const mut2 = jest.fn((s) => s);
      traverse(schema2, mut2, { skipFirstMutation: true, mutable: true }) as JSONSchemaObject;

      testCalls(mut1, schema1);
      expect(mut1).toHaveBeenCalledTimes(1);
      expect((schema1.properties as Properties).skipFirstCycle).toBe(schema1);

      testCalls(mut2, schema2);
      expect(mut2).toHaveBeenCalledTimes(1);
      expect(schema2.items).toBe(schema2);

      expect(mut1).toHaveBeenCalledWith(
        schema1.properties.skipFirstCycle,
        true,
        expect.any(String),
        schema1
      );

      expect(mut2).toHaveBeenCalledWith(
        schema2.items,
        true,
        expect.any(String),
        schema2
      );
    });
  });

  describe("isCycle", () => {
    it("true when the schema is a deep cycle", () => {
      const schema: any = {
        type: "object",
        properties: {
          foo: {
            type: "object",
            properties: { bar: {} },
          },
        },
      };
      schema.properties.foo.properties.bar = schema.properties.foo;

      const mut = jest.fn((s) => s);

      traverse(schema as JSONSchema, mut, { mutable: true });

      testCalls(mut, schema.properties.foo, true);
      expect(mut).not.toHaveBeenCalledWith(
        schema.properties.foo,
        false,
        "$.properties.foo",
        expect.anything()
      );
      expect(mut).toHaveBeenCalledTimes(2);
    });

    it("true when the schema is the root of a cycle", () => {
      const schema: any = { type: "object", properties: { foo: {} } };
      schema.properties.foo = schema;
      const mut = jest.fn((s) => s);
      traverse(schema as JSONSchema, mut, { mutable: true });
      expect(mut).toHaveBeenCalledWith(schema, true, "$", undefined);
    });

    it("true when the cycle is inside oneOf", () => {
      const schema: any = {
        title: "a",
        oneOf: [{
          title: "b",
          type: "object",
          properties: { a: {} }
        }]
      };
      schema.oneOf[0].properties.a = schema;

      const mut = jest.fn((s) => s);

      traverse(schema as JSONSchema, mut, { mutable: false });

      expect(mut).nthCalledWith(
        1,
        schema.oneOf[0],
        false,
        expect.any(String),
        schema
      );
      expect(mut).nthCalledWith(
        2,
        schema,
        true,
        "$",
        undefined
      );
    });
  });

  describe("bfs", () => {
    it("call order is correct for nested objects and arrays", () => {
      const schema: any = {
        type: "object",
        properties: {
          foo: {
            type: "array",
            items: [
              { type: "string" },
              { type: "number" },
            ]
          }
        }
      };
      const mut = jest.fn((s) => s);

      traverse(schema as JSONSchema, mut, { bfs: true });

      testCalls(mut, schema, false, 1, false);
      testCalls(mut, schema.properties.foo, false, 2);
      testCalls(mut, schema.properties.foo.items[0], false, 3);
      testCalls(mut, schema.properties.foo.items[1], false, 4);
    });

    it("works with mutable settings", () => {
      const schema: any = {
        type: "object",
        properties: {
          foo: {
            type: "array",
            items: [
              { type: "string" },
              { type: "number" },
            ]
          }
        }
      };
      const mut = jest.fn((s) => s);

      traverse(schema as JSONSchema, mut, { bfs: true, mutable: true });

      testCalls(mut, schema, false, 1, false);
      testCalls(mut, schema.properties.foo, false, 2);
      testCalls(mut, schema.properties.foo.items[0], false, 3);
      testCalls(mut, schema.properties.foo.items[1], false, 4);
    });
  });
});
