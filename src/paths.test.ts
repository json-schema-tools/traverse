import traverse from "./";
import { JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse paths", () => {
  const test = (s: JSONSchema, paths: string[], isRoot: boolean = false) => {
    const mutator = jest.fn((s) => s);

    traverse(s, mutator);

    paths.forEach((path, i) => {
      expect(mutator).nthCalledWith(
        i + 1,
        expect.anything(),
        expect.any(Boolean),
        path,
        i === paths.length - 1 ? undefined : expect.anything()
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

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);
      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.properties.a',
        expect.anything(),
      );
      expect(mutator).nthCalledWith(
        2,
        expect.anything(),
        expect.any(Boolean),
        '$.properties.b',
        expect.anything()
      );
    });
    it("allows boolean subschema in properties", () => {
      const testSchema = { type: "object", properties: { a: true, b: false } } as JSONSchema;

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);
      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.properties.a',
        expect.anything(),
      );
      expect(mutator).nthCalledWith(
        2,
        expect.anything(),
        expect.any(Boolean),
        '$.properties.b',
        expect.anything()
      );
    });
  });

  describe("schema.additionalProperties", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);
      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.additionalProperties',
        expect.anything(),
      );
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

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.additionalProperties.properties.c',
        expect.anything(),
      );
      expect(mutator).nthCalledWith(
        2,
        expect.anything(),
        expect.any(Boolean),
        '$.additionalProperties.properties.d',
        expect.anything()
      );

      expect(mutator).nthCalledWith(
        3,
        expect.anything(),
        expect.any(Boolean),
        '$.additionalProperties',
        expect.anything()
      );

      expect(mutator).nthCalledWith(
        4,
        expect.anything(),
        expect.any(Boolean),
        '$',
        undefined
      );
      test(testSchema, [
        "$.additionalProperties.properties.c",
        "$.additionalProperties.properties.d",
        "$.additionalProperties",
        "$",
      ]);
    });
  });

  describe("schema.additionalItems", () => {
    it("allows boolean", () => {
      const testSchema: any = {
        additionalItems: true
      };

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.additionalItems',
        expect.anything(),
      );
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

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      test(testSchema, [
        "$.additionalItems.properties.c",
        "$.additionalItems.properties.d",
        "$.additionalItems",
        "$",
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

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.items[0]',
        expect.anything(),
      );
      expect(mutator).nthCalledWith(
        2,
        expect.anything(),
        expect.any(Boolean),
        '$.items[1]',
        expect.anything()
      );
    });

    it("allows a schema", () => {
      const testSchema = {
        type: "array",
        items: { type: "number" },
      } as JSONSchema;

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).nthCalledWith(
        1,
        expect.anything(),
        expect.any(Boolean),
        '$.items',
        expect.anything(),
      );
      expect(mutator).nthCalledWith(
        2,
        expect.anything(),
        expect.any(Boolean),
        '$',
        undefined
      );
    });
  });
});
