
import traverse from "./";
import { JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse parent", () => {
  const test = (s: JSONSchema, parents: Array<JSONSchema | undefined>) => {
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

  describe('skipFirstMutation', () => {
    it('works normally using bfs and skipFirstMutation', () => {
      const s = {
        type: "object",
        properties: {
          foo: {
            type: "array",
            items: [
              { type: "string" },
              { type: "number" }
            ]
          },
        }
      };

      const mutation = jest.fn((s) => s);

      traverse(s as JSONSchema, mutation, { bfs: true, skipFirstMutation: true });
      expect(mutation).nthCalledWith(
        1,
        s.properties.foo,
        expect.any(Boolean),
        expect.any(String),
        s
      );

      expect(mutation).nthCalledWith(
        2,
        s.properties.foo.items[0],
        expect.any(Boolean),
        expect.any(String),
        s.properties.foo
      );

      expect(mutation).nthCalledWith(
        3,
        s.properties.foo.items[1],
        expect.any(Boolean),
        expect.any(String),
        s.properties.foo
      );
    });

    it('works normally when there is a cycle to the root', () => {
      const s = {
        type: "object",
        items: [
          {
            type: "object",
            properties: {
              foo: {}
            }
          },
          {},
          {
            type: "array",
            items: [
              { type: 'string' },
              { type: 'number' },
            ]
          }
        ]
      } as any;

      s.items[1] = s;
      const mutation = jest.fn((s) => s);

      traverse(s as JSONSchema, mutation, { skipFirstMutation: true });
      expect(mutation).toBeCalledTimes(6);
      expect(mutation).nthCalledWith(
        1,
        s.items[0].properties.foo,
        expect.any(Boolean),
        expect.any(String),
        s.items[0]
      );

      expect(mutation).nthCalledWith(
        2,
        s.items[0],
        expect.any(Boolean),
        expect.any(String),
        s
      );

      expect(mutation).nthCalledWith(
        3,
        s.items[1],
        expect.any(Boolean),
        expect.any(String),
        s
      );

      expect(mutation).nthCalledWith(
        4,
        s.items[2].items[0],
        expect.any(Boolean),
        expect.any(String),
        s.items[2],
      );

      expect(mutation).nthCalledWith(
        5,
        s.items[2].items[1],
        expect.any(Boolean),
        expect.any(String),
        s.items[2],
      );

      expect(mutation).nthCalledWith(
        6,
        s.items[2],
        expect.any(Boolean),
        expect.any(String),
        s
      );
    });

    it('cycles return the parent of where the cycle was found, not the parent of the schema reffed by the cycle', () => {
      const s = {
        type: "array",
        items: {
          type: "object",
          items: [
            {
              type: "object",
              properties: {
                foo: {},
                baz: {},
                bar: {
                  type: "object",
                  properties: {
                    a: {}
                  }
                },
              }
            },
          ]
        }
      } as any;

      s.items.items[0].properties.foo = s.items; // not a cycle to root, 1 deep
      const mutation = jest.fn((s) => s);

      traverse(s as JSONSchema, mutation, { skipFirstMutation: true });
      expect(mutation).toBeCalledTimes(5); // this really should probably be 6, indicating a potential bug
      expect(mutation).nthCalledWith(
        1,
        s.items.items[0].properties.baz,
        expect.any(Boolean),
        expect.any(String),
        s.items.items[0]
      );
      expect(mutation).nthCalledWith(
        2,
        s.items.items[0].properties.bar.properties.a,
        expect.any(Boolean),
        expect.any(String),
        s.items.items[0].properties.bar
      );
      expect(mutation).nthCalledWith(
        3,
        s.items.items[0].properties.bar,
        expect.any(Boolean),
        expect.any(String),
        s.items.items[0]
      );
      expect(mutation).nthCalledWith(
        4,
        s.items.items[0],
        expect.any(Boolean),
        expect.any(String),
        s.items
      );

      expect(mutation).nthCalledWith(
        5,
        s.items,
        true,
        expect.any(String),
        s // this is the vital part of whats under test - the parent of the cycle is s, not `s.items.items[0]`
      );
    });
  });


  describe("schema is a boolean", () => {
    it("allows root schema as boolean", () => {
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
      const testSchema = {
        additionalItems: {
          properties: {
            c: {},
            d: {},
            e: {
              type: 'object',
              properties: {
                f: {}
              }
            },
          },
        },
      };

      const mutator = jest.fn((s) => s);

      traverse(testSchema, mutator);

      expect(mutator).nthCalledWith(
        1,
        testSchema.additionalItems.properties.c,
        expect.any(Boolean),
        expect.any(String),
        testSchema.additionalItems
      );

      expect(mutator).nthCalledWith(
        2,
        testSchema.additionalItems.properties.d,
        expect.any(Boolean),
        expect.any(String),
        testSchema.additionalItems
      );

      expect(mutator).nthCalledWith(
        3,
        testSchema.additionalItems.properties.e.properties.f,
        expect.any(Boolean),
        expect.any(String),
        testSchema.additionalItems.properties.e
      );

      expect(mutator).nthCalledWith(
        4,
        testSchema.additionalItems.properties.e,
        expect.any(Boolean),
        expect.any(String),
        testSchema.additionalItems
      );

      expect(mutator).nthCalledWith(
        5,
        testSchema.additionalItems,
        expect.any(Boolean),
        expect.any(String),
        testSchema
      );

      expect(mutator).nthCalledWith(
        6,
        testSchema,
        expect.any(Boolean),
        expect.any(String),
        undefined
      );
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
        return args[0];
      });

      traverse(testSchema, mutator);

      expect(mutator).toHaveBeenCalledWith(
        testSchema.items.properties.c,
        false,
        expect.any(String),
        testSchema.items
      );

      expect(mutator).toHaveBeenCalledWith(
        testSchema.items,
        false,
        expect.any(String),
        testSchema,
      );

      expect(mutator).toHaveBeenCalledWith(
        testSchema,
        false,
        expect.any(String),
        undefined,
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
