
import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe("traverse parent", () => {
  const test = (s: JSONSchema, parents: JSONSchema[]) => {
    const mutator = jest.fn((s) => s);

    traverse(s, mutator);

    parents.forEach((parent) => {
      expect(mutator).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Boolean),
        expect.any(String),
        parent,
      );
    });
  };

  describe("schema is a boolean", () => {
    it("allows root schema as boolean", () => {
      const testSchema: JSONSchema = true;
      test(testSchema, [testSchema]);
    });
  });

  describe("schema.properties", () => {
    it("allows traversing property subschemas", () => {
      const testSchema: JSONSchema = {
        properties: {
          a: {},
          b: {},
        },
      };

      test(testSchema, [testSchema]);
    });

    it("allows boolean subschema in properties", () => {
      const testSchema: JSONSchema = {
        type: "object",
        properties: { a: true, b: false }
      };

      test(testSchema, [testSchema]);
    });
  });

  describe("schema.additionalProperties", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };
      test(testSchema, [testSchema]);
    });

    it("allows subschema", () => {
      const testSchema: any = {
        additionalProperties: {
          properties: {
            c: {},
            d: {},
          },
        },
      };

      test(testSchema, [
        testSchema,
        testSchema.additionalProperties
      ]);
    });
  });

  describe("schema.additionalItems", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalItems: true
      };
      test(testSchema, [testSchema]);
    });

    it("allows subschema", () => {
      const testSchema: any = {
        additionalItems: {
          properties: {
            c: {},
            d: {},
          },
        },
      };

      test(testSchema, [testSchema, testSchema.additionalItems]);
    });
  });

  describe("schema.items", () => {
    it("allows an array of schema", () => {
      const testSchema = {
        type: "array",
        items: [
          { type: "string" },
          { type: "number" },
        ]
      } as JSONSchema;

      test(testSchema, [testSchema]);
    });

    it("allows a schema", () => {
      const testSchema = {
        type: "array",
        items: { type: "number" },
      } as JSONSchema;

      test(testSchema, [testSchema]);
    });
  });

  describe("schema.oneOf", () => {
    it("works with deeply nested oneOfs", () => {
      const testSchema: any = {
        oneOf: [
          {
            oneOf: [{ type: "number" }, { type: "string" }]
          },
          {
            type: "object",
            properties: {
              foo: {
                oneOf: [
                  { type: "array", items: true }, { type: "boolean" }
                ]
              }
            }
          }
        ]
      };

      test(testSchema, [
        testSchema,
        testSchema.oneOf[0],
        testSchema.oneOf[1],
        testSchema.oneOf[1].properties.foo,
      ]);
    });
  });
});
