
import traverse from "./";
import { JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse parent", () => {
  const test = (s: JSONSchema, parents: (JSONSchema | undefined)[], isCycle = false) => {
    const mutator = jest.fn((s) => s);

    traverse(s, mutator);

    parents.forEach((parent) => {
      expect(mutator).toHaveBeenCalledWith(
        expect.anything(),
        expect.any(Boolean),
        expect.any(String),
        parent,
      );

      if (!isCycle) {
        expect(mutator).not.toHaveBeenCalledWith(
          s,
          expect.any(Boolean),
          expect.any(String),
          s
        );
      }
    });
  };

  describe("schema is a boolean", () => {
    it("allows root schema as boolean, but its parent is undefined", () => {
      const testSchema: JSONSchema = true;
      test(testSchema, [undefined]);
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

    it("parent for additionalItems is correct", () => {
      const testSchema: any = {
        type: "array",
        additionalItems: {
          properties: {
            c: {},
            d: {},
          },
        },
      };

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).toHaveBeenCalledWith(
        expect.anything(),
        false,
        expect.any(String),
        testSchema.additionalItems
      );
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

    it("doesnt call mutator with parent being itself when there is no cycle", () => {
      const testSchema: any = {
        type: "array",
        items: {
          properties: {
            c: {},
            d: {},
          },
        },
      };

      const mutator = jest.fn((...args) => {
        console.log(args);
        return args[0];
      });

      traverse(testSchema, mutator);

      expect(mutator).toHaveBeenCalledWith(
        testSchema.items.properties.c,
        false,
        expect.any(String),
        testSchema.items
      );

      // additionalItems is not the root should not be the its own parent
      expect(mutator).not.toHaveBeenCalledWith(
        testSchema.items,
        false,
        expect.any(String),
        testSchema.items
      );
    });
  });

  describe("schema.oneOf", () => {
    it.only("works with deeply nested oneOfs", () => {
      const testSchema: any = {
        title: '1',
        oneOf: [
          {
            title: '2',
            oneOf: [
              {
                title: '3',
                type: "number"
              },
              {
                title: '4',
                type: "string"
              }
            ]
          },
          {
            title: '5',
            type: "object",
            properties: {
              foo: {
                title: '6',
                oneOf: [
                  {
                    title: '7',
                    type: "array",
                    items: true
                  },
                  {
                    title: '8',
                    type: "boolean"
                  }
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

    it("works with cycle to the root", () => {
      const testSchema: any = {
        oneOf: [
          {},
        ]
      };

      testSchema.oneOf[0] = testSchema;

      test(testSchema, [testSchema], true);
    });
  });
});
