import traverse, { MutationFunction } from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";
import { testCalls } from "./test-utils";

describe("traverse basic", () => {

  it("it calls mutate only once when there are no subschemas", () => {
    const testSchema = {};
    const mockMutation = jest.fn((s) => s);

    traverse(testSchema, mockMutation);

    expect(mockMutation).toHaveBeenCalledTimes(1);
  });

  it("default mutate", () => {
    const testSchema = {
      type: "string"
    } as JSONSchema;
    const mutator = () => ({ hello: "world" });

    const result = traverse(testSchema, mutator) as any;

    expect(result.hello).toBe("world");
    expect(result.type).toBe(undefined);
  });

  it("mutate does not affect traversal", () => {
    const testSchema = {
      type: "object"
    } as JSONSchema;

    const mutator = jest.fn((s: JSONSchemaObject) => ({
      ...s,
      properties: {
        foo: { type: "string" }
      }
    }));

    const result = traverse(testSchema, mutator as MutationFunction) as JSONSchemaObject;

    expect(result.properties).toBeDefined();

    expect(mutator).toHaveBeenCalledTimes(1);
  });

  it("merge does not affect traversal", () => {
    const testSchema = {
      type: "object"
    } as JSONSchema;
    const mergeProducer = jest.fn((s: JSONSchemaObject) => ({
      ...s,
      properties: {
        foo: { type: "string" }
      }
    }));

    const opts = { mergeNotMutate: true };

    const result = traverse(testSchema, mergeProducer as MutationFunction, opts) as JSONSchemaObject;

    expect(result.properties).toBeDefined();

    expect(mergeProducer).toHaveBeenCalledTimes(1);
  });


  describe("basic functionality", () => {
    const test = (prop: string, useVal?: any) => {
      const a = {};
      const b = {};
      const testSchema: any = {};
      testSchema[prop] = useVal ? useVal : [a, b];
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      if (useVal) {
        testCalls(mockMutation, useVal);
      } else {
        testCalls(mockMutation, a);
      }

      return mockMutation;
    };

    ["anyOf", "oneOf", "allOf"].forEach((prop) => {
      it(`traverses ${prop}`, () => {
        test(prop);
      });
    });

    it("traverses items when items is ordered list", () => {
      test("items");
    });

    it("traverses items when items constrained to single schema", () => {
      test("items", { a: {}, b: {} });
    });

    it("accepts boolean as a valid schema", () => {
      const testSchema: any = true;
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      testCalls(mockMutation, testSchema, false, 1, false);
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it("accepts boolean as valid schema in a nested schema", () => {
      const schema = { type: "object", properties: { a: true, b: false } } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);
      expect(mockMutation).toHaveBeenNthCalledWith(
        1,
        true,
        false,
        expect.any(String),
        expect.anything(),
      );
      expect(mockMutation).toHaveBeenNthCalledWith(
        2,
        false,
        false,
        expect.any(String),
        expect.anything(),
      );
      expect(mockMutation).toHaveBeenNthCalledWith(
        3,
        schema,
        false,
        expect.any(String),
        undefined
      );
    });

    it("accepts patternProperties", () => {
      const a = { type: "string" } as JSONSchema;
      const b = { type: "number" } as JSONSchema;
      const schema = {
        type: "object",
        patternProperties: { "*.": a, "x-^": b }
      };
      const mockMutation = jest.fn((s) => s);
      traverse(schema as JSONSchema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);

      expect(mockMutation).nthCalledWith(
        1,
        schema.patternProperties['*.'],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        2,
        schema.patternProperties['x-^'],
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("allows booleans that are created via boolean class and new", () => {
      const a = new Boolean(true);
      const b = new Boolean(false);
      const schema = { type: "object", properties: { a, b } };
      const mockMutation = jest.fn((s) => s);
      traverse(schema as JSONSchema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);

      expect(mockMutation).nthCalledWith(
        1,
        schema.properties.a,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        2,
        schema.properties.b,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        3,
        schema,
        expect.anything(),
        expect.anything(),
        undefined
      );
      expect(mockMutation).not.toHaveBeenNthCalledWith(
        1,
        true,
        expect.anything(),
        expect.anything()
      );
      expect(mockMutation).not.toHaveBeenNthCalledWith(
        2,
        false,
        expect.anything(),
        expect.anything()
      );
    });

    it("items is a boolean", () => {
      const schema = { type: "array", items: true };
      const mockMutation = jest.fn((s) => s);
      traverse(schema as JSONSchema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(2);
      expect(mockMutation).nthCalledWith(
        1,
        schema.items,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        2,
        schema,
        expect.anything(),
        expect.anything(),
        undefined,
      );
    });

    it("doesnt skip boolean schemas that it has not seen", () => {
      const schema = {
        type: "object",
        properties: {
          a: true,
          b: {
            properties: {
              c: true,
              d: { properties: { e: false } }
            }
          }
        }
      } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(6);
    });

    it("traverses properties", () => {
      const testSchema: any = {
        properties: {
          a: {},
          b: {},
        },
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).nthCalledWith(
        1,
        testSchema.properties.a,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        2,
        testSchema.properties.b,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        3,
        testSchema,
        expect.anything(),
        expect.anything(),
        undefined,
      );

      expect(mockMutation).toHaveBeenCalledTimes(3);
    });

    it("traverses additionalProperties as boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).nthCalledWith(
        1,
        testSchema.additionalProperties,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        2,
        testSchema,
        expect.anything(),
        expect.anything(),
        undefined,
      );
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("traverses additionalProperties as schema", () => {
      const testSchema: any = {
        additionalProperties: {
          properties: {
            c: {},
            d: {},
          },
        },
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).nthCalledWith(
        1,
        testSchema.additionalProperties.properties.c,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
      expect(mockMutation).nthCalledWith(
        2,
        testSchema.additionalProperties.properties.d,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        3,
        testSchema.additionalProperties,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );

      expect(mockMutation).nthCalledWith(
        4,
        testSchema,
        expect.anything(),
        expect.anything(),
        undefined
      );

      expect(mockMutation).toHaveBeenCalledTimes(4);
    });

    describe("additionalItems", () => {
      it("as a boolean schema true", () => {
        const testSchema: any = {
          additionalItems: true
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);

        expect(mockMutation).nthCalledWith(
          1,
          testSchema.additionalItems,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          2,
          testSchema,
          expect.anything(),
          expect.anything(),
          undefined,
        );

        expect(mockMutation).toHaveBeenCalledTimes(2);
      });

      it("as a boolean schema false", () => {
        const testSchema: any = {
          additionalItems: false
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);


        expect(mockMutation).nthCalledWith(
          1,
          testSchema.additionalItems,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          2,
          testSchema,
          expect.anything(),
          expect.anything(),
          undefined,
        );

        expect(mockMutation).toHaveBeenCalledTimes(2);
      });

      it("as a boolean schema true: items is array", () => {
        const testSchema: any = {
          items: [{ type: "string" }],
          additionalItems: true
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);

        expect(mockMutation).nthCalledWith(
          1,
          testSchema.items[0],
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          2,
          testSchema.additionalItems,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          3,
          testSchema,
          expect.anything(),
          expect.anything(),
          undefined
        );

        expect(mockMutation).toHaveBeenCalledTimes(3);
      });

      it("as a boolean schema false: items is single schema", () => {
        const testSchema: any = {
          items: { type: "string" },
          additionalItems: false
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);

        expect(mockMutation).nthCalledWith(
          1,
          testSchema.items,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          2,
          testSchema.additionalItems,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          3,
          testSchema,
          expect.anything(),
          expect.anything(),
          undefined
        );

        expect(mockMutation).toHaveBeenCalledTimes(3);
      });

      it("schema with nested subschemas: items is array", () => {
        const testSchema: any = {
          items: [{ type: "string" }],
          additionalItems: {
            properties: {
              c: {},
              d: {},
            },
          },
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);

        expect(mockMutation).toHaveBeenCalledTimes(5);
        expect(mockMutation).nthCalledWith(
          1,
          testSchema.items[0],
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          2,
          testSchema.additionalItems.properties.c,
          false,
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          3,
          testSchema.additionalItems.properties.d,
          false,
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          4,
          testSchema.additionalItems,
          false,
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          5,
          testSchema,
          false,
          expect.anything(),
          undefined
        );

      });

      it("schema with nested subschemas: items is single schema", () => {
        const testSchema: any = {
          items: { type: "string" },
          additionalItems: {
            properties: {
              c: {},
              d: {},
            },
          },
        };
        const mockMutation = jest.fn((mockS) => mockS);

        traverse(testSchema, mockMutation);
        expect(mockMutation).toHaveBeenCalledTimes(5);

        expect(mockMutation).nthCalledWith(
          1,
          testSchema.items,
          expect.anything(),
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          2,
          testSchema.additionalItems.properties.c,
          false,
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          3,
          testSchema.additionalItems.properties.d,
          false,
          expect.anything(),
          expect.anything(),
        );
        expect(mockMutation).nthCalledWith(
          4,
          testSchema.additionalItems,
          false,
          expect.anything(),
          expect.anything(),
        );

        expect(mockMutation).nthCalledWith(
          5,
          testSchema,
          false,
          expect.anything(),
          undefined
        );

      });
    });
  });


  describe("schema.type being an array", () => {
    it("allows type to be an array", () => {
      const schema = { type: ["boolean", "string"], title: "gotimebucko" } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it("array and or object", () => {
      const schema = {
        type: ["object", "array"],
        title: "gotimebucko",
        properties: {
          a: { type: "string" },
          b: { type: "integer" }
        },
        items: { type: "string" }
      } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });
  });
});
