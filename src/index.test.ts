import traverse from "./";
import { JSONMetaSchema, Properties } from "@json-schema-tools/meta-schema";

describe("traverse", () => {
  it("it calls mutate only once when there are no subschemas", () => {
    const testSchema = {};
    const mockMutation = jest.fn((s) => s);

    traverse(testSchema, mockMutation);

    expect(mockMutation).toHaveBeenCalledTimes(1);
  });

  it("default mutate", () => {
    const testSchema = {
      type: "string"
    };
    const mutator = () => ({ hello: "world" });

    const result = traverse(testSchema, mutator) as JSONMetaSchema;

    expect(result.hello).toBe("world");
    expect(result.type).toBe(undefined);
  });

  it("mutate does not affect traversal", () => {
    const testSchema = {
      type: "object"
    };

    const mutator = jest.fn((s: JSONMetaSchema) => ({
      ...s,
      properties: {
        foo: { type: "string" }
      }
    }));

    const result = traverse(testSchema, mutator) as JSONMetaSchema;

    expect(result.properties).toBeDefined();

    expect(mutator).toHaveBeenCalledTimes(1);
  });

  it("merge does not affect traversal", () => {
    const testSchema = {
      type: "object"
    };
    const mergeProducer = jest.fn((s: JSONMetaSchema) => ({
      ...s,
      properties: {
        foo: { type: "string" }
      }
    }));

    const opts = { mergeNotMutate: true };

    const result = traverse(testSchema, mergeProducer, opts) as JSONMetaSchema;

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
        expect(mockMutation).toHaveBeenCalledWith(useVal);
      } else {
        expect(mockMutation).toHaveBeenCalledWith(a);
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

      expect(mockMutation).toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it("accepts boolean as valid schema in a nested schema", () => {
      const schema = { type: "object", properties: { a: true, b: false } };
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);
      expect(mockMutation).toHaveBeenNthCalledWith(1, true);
      expect(mockMutation).toHaveBeenNthCalledWith(2, false);
      expect(mockMutation).toHaveBeenNthCalledWith(3, schema);
    });


    it("allows booleans that are created via boolean class and new", () => {
      const a = new Boolean(true);
      const b = new Boolean(false);
      const schema = { type: "object", properties: { a, b } };
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);

      expect(mockMutation).toHaveBeenNthCalledWith(1, a);
      expect(mockMutation).toHaveBeenNthCalledWith(1, true);

      expect(mockMutation).toHaveBeenNthCalledWith(2, b);
      expect(mockMutation).toHaveBeenNthCalledWith(2, false);

      expect(mockMutation).toHaveBeenNthCalledWith(3, schema);
    });

    it("when items is a boolean works fine", () => {
      const schema = { type: "array", items: true };
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(2);
      expect(mockMutation).toHaveBeenNthCalledWith(1, true);
      expect(mockMutation).toHaveBeenNthCalledWith(2, schema);
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
      };
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

      expect(mockMutation).toHaveBeenCalledWith(testSchema.properties.a);
      expect(mockMutation).toHaveBeenCalledWith(testSchema.properties.b);
      expect(mockMutation).toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(3);
    });

    it("traverses additionalProperties as boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalProperties);
      expect(mockMutation).toHaveBeenCalledWith(testSchema);
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

      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalProperties);
      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalProperties.properties.c);
      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalProperties.properties.d);
      expect(mockMutation).toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });

    it("traverses additionalItems as boolean", () => {
      const testSchema: any = {
        additionalItems: true
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalItems);
      expect(mockMutation).toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("traverses additionalItems as schema", () => {
      const testSchema: any = {
        additionalItems: {
          properties: {
            c: {},
            d: {},
          },
        },
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalItems);
      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalItems.properties.c);
      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalItems.properties.d);
      expect(mockMutation).toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });

  });


  describe("schema.type being an array", () => {
    it("allows type to be an array", () => {
      const schema = { type: ["boolean", "string"], title: "gotimebucko" };
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
      };
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });
  });

  describe("cycle detection", () => {
    it("handles basic cycles", () => {
      const schema = { type: "object", properties: { foo: {} } };
      schema.properties.foo = schema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it("does not follow $refs", () => {
      const schema = { type: "object", properties: { foo: { $ref: "#" } } };
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
      traverse(schema, mockMutation);
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
      traverse(schema, mockMutation);
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
      traverse(schema, mockMutation);
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
              { title: "7", type: "object", properties: { baz: { title: "8" } } },
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
      const result: JSONMetaSchema = traverse(schema, (s: JSONMetaSchema) => {
        if (s.$ref) { return schema; }
        return s;
      }, { mutable: true });
      const rProps = result.properties as any;
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
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });

  });

  describe("skipFirstMutation", () => {
    it("skips the first schema when the option skipFirstMutation is true", () => {
      const testSchema: any = { anyOf: [{}, {}] };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      expect(mockMutation).not.toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("skips first mutation when schema is a bool", () => {
      const testSchema: any = true;
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      expect(mockMutation).not.toHaveBeenCalledWith(testSchema);
      expect(mockMutation).toHaveBeenCalledTimes(0);
    });

    it("When the 2nd schema down is a cycle to its parent, the mutation function is called regardless", () => {
      const testSchema1: any = {
        title: "skipFirstCycles",
        type: "object",
        properties: {
          skipFirstCycle: {}
        }
      };

      const testSchema2: any = {
        title: "skipFirstCycles",
        type: "object",
        items: {}
      };

      testSchema1.properties.skipFirstCycle = testSchema1;
      testSchema2.items = testSchema2;

      const mockMutation1 = jest.fn((mockS) => mockS);
      const testSchema1Result = traverse(testSchema1, mockMutation1, { skipFirstMutation: true }) as JSONMetaSchema;

      const mockMutation2 = jest.fn((mockS) => mockS);
      const testSchema2Result = traverse(testSchema2, mockMutation2, { skipFirstMutation: true }) as JSONMetaSchema;

      expect(mockMutation1).toHaveBeenCalledWith(testSchema1);
      expect(mockMutation1).toHaveBeenCalledTimes(1);
      expect((testSchema1Result.properties as Properties).skipFirstCycle).toBe(testSchema1Result);

      expect(mockMutation2).toHaveBeenCalledWith(testSchema2);
      expect(mockMutation2).toHaveBeenCalledTimes(1);
      expect(testSchema2Result.items).toBe(testSchema2Result);
    });

  });

});
