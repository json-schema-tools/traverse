import traverse from "./";
import { JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse paths", () => {
  const test = (s: JSONSchema, paths: string[], isRoot: boolean = false) => {
    const mutator = jest.fn((s) => s);

    traverse(s, mutator);

    paths.forEach((path) => {
      expect(mutator).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Boolean),
        path,
        isRoot ? undefined : expect.anything()
      );
    });
  };

  describe("schema is a boolean", () => {
    it("allows root schema as boolean", () => {
      const testSchema: any = true;
      test(testSchema, ["$"], true);
    });
  });

  describe("schema.properties", () => {
    it("allows traversing property subschemas", () => {
      const testSchema: any = {
        properties: {
          a: {},
          b: {},
        },
      };
      test(testSchema, [
        "$",
        "$.properties.a",
        "$.properties.b",
      ]);
    });
    it("allows boolean subschema in properties", () => {
      const testSchema = { type: "object", properties: { a: true, b: false } } as JSONSchema;
      test(testSchema, [
        "$",
        "$.properties.a",
        "$.properties.b",
      ]);
    });
  });

  describe("schema.additionalProperties", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };
      test(testSchema, ["$", "$.additionalProperties"]);
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
        "$",
        "$.additionalProperties",
        "$.additionalProperties.properties.c",
        "$.additionalProperties.properties.d",
      ]);
    });
  });

  describe("schema.additionalItems", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalItems: true
      };
      test(testSchema, ["$", "$.additionalItems"]);
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

      test(testSchema, [
        "$",
        "$.additionalItems",
        "$.additionalItems.properties.c",
        "$.additionalItems.properties.d",
      ]);
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
      test(testSchema, ["$.items[0]"]);
    });

    it("allows a schema", () => {
      const testSchema = {
        type: "array",
        items: { type: "number" },
      } as JSONSchema;

      test(testSchema, ["$.items"]);
    });
  });
});
