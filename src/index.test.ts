import traverse, { MutationFunction } from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";

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
        expect(mockMutation).toHaveBeenCalledWith(useVal, false, expect.stringMatching(/.*/));
      } else {
        expect(mockMutation).toHaveBeenCalledWith(a, false, expect.stringMatching(/.*/));
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

      expect(mockMutation).toHaveBeenCalledWith(testSchema, false, expect.any(String));
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
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenNthCalledWith(
        2,
        false,
        false,
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenNthCalledWith(
        3,
        schema,
        false,
        expect.any(String)
      );
    });

    it("accepts patternProperties", () => {
      const a = { type: "string" };
      const b = { type: "number" };
      const schema = {
        type: "object",
        patternProperties: { "*.": a, "x-^": b }
      } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);
      expect(mockMutation).toHaveBeenNthCalledWith(1, a, false, "$.patternProperties.*.");
      expect(mockMutation).toHaveBeenNthCalledWith(2, b, false, "$.patternProperties.x-^");
      expect(mockMutation).toHaveBeenNthCalledWith(3, schema, false, "$");
    });

    it("allows booleans that are created via boolean class and new", () => {
      const a = new Boolean(true);
      const b = new Boolean(false);
      const schema = { type: "object", properties: { a, b } } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(3);

      expect(mockMutation).toHaveBeenNthCalledWith(1, a, false, "$.properties.a");
      expect(mockMutation).not.toHaveBeenNthCalledWith(1, true, false, "$.properties.a");

      expect(mockMutation).toHaveBeenNthCalledWith(2, b, false, "$.properties.b");
      expect(mockMutation).not.toHaveBeenNthCalledWith(2, false, false, "$.properties.b");

      expect(mockMutation).toHaveBeenNthCalledWith(3, schema, false, "$");
    });

    it("items is a boolean", () => {
      const schema = { type: "array", items: true } as JSONSchema;
      const mockMutation = jest.fn((s) => s);
      traverse(schema, mockMutation);
      expect(mockMutation).toHaveBeenCalledTimes(2);
      expect(mockMutation).toHaveBeenNthCalledWith(1, true, false, "$.items");
      expect(mockMutation).toHaveBeenNthCalledWith(2, schema, false, "$");
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

      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.properties.a,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.properties.b,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledTimes(3);
    });

    it("traverses additionalProperties as boolean", () => {
      const testSchema: any = {
        additionalProperties: true
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).toHaveBeenCalledWith(testSchema.additionalProperties, false, "$.additionalProperties");
      expect(mockMutation).toHaveBeenCalledWith(testSchema, false, "$");
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

      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalProperties,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalProperties.properties.c,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalProperties.properties.d,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(testSchema, false, expect.any(String));
      expect(mockMutation).toHaveBeenCalledTimes(4);
    });

    it("traverses additionalItems as boolean", () => {
      const testSchema: any = {
        additionalItems: true
      };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation);

      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalItems,
        false,
        expect.any(String),
      );
      expect(mockMutation).toHaveBeenCalledWith(testSchema, false, expect.any(String));
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

      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalItems,
        false,
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalItems.properties.c,
        false,
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema.additionalItems.properties.d,
        false,
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenCalledWith(
        testSchema,
        false,
        expect.any(String)
      );
      expect(mockMutation).toHaveBeenCalledTimes(4);
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

  describe("cycle detection", () => {
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

  describe("skipFirstMutation", () => {
    it("skips the first schema when the option skipFirstMutation is true", () => {
      const testSchema: any = { anyOf: [{}, {}] };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      expect(mockMutation).not.toHaveBeenCalledWith(testSchema, expect.any, expect.any);
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("skips first mutation when schema is a bool", () => {
      const testSchema: any = true;
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      expect(mockMutation).not.toHaveBeenCalledWith(testSchema, expect.any, expect.any);
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
      traverse(testSchema1, mockMutation1, { skipFirstMutation: true, mutable: true }) as JSONSchemaObject;

      const mockMutation2 = jest.fn((mockS) => mockS);
      traverse(testSchema2, mockMutation2, { skipFirstMutation: true, mutable: true }) as JSONSchemaObject;

      expect(mockMutation1).toHaveBeenCalledWith(testSchema1, true, "$.properties.skipFirstCycle");
      expect(mockMutation1).toHaveBeenCalledTimes(1);
      expect((testSchema1.properties as Properties).skipFirstCycle).toBe(testSchema1);

      expect(mockMutation2).toHaveBeenCalledWith(testSchema2, true, "$");
      expect(mockMutation2).toHaveBeenCalledTimes(1);
      expect(testSchema2.items).toBe(testSchema2);
    });

  });

  describe("isCycle", () => {

    it("true when the schema is a deep cycle", () => {
      const testSchema = {
        type: "object",
        properties: {
          foo: {
            type: "object",
            properties: { bar: {} },
          },
        },
      };

      testSchema.properties.foo.properties.bar = testSchema.properties.foo;

      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { mutable: true });

      expect(mockMutation).toHaveBeenCalledWith(testSchema.properties.foo, true, "$.properties.foo");
      expect(mockMutation).not.toHaveBeenCalledWith(testSchema.properties.foo, false, "$.properties.foo");
      expect(mockMutation).toHaveBeenCalledTimes(2);
    });

    it("true when the schema is the root of a cycle", () => {
      const testSchema = {
        type: "object",
        properties: {
          foo: {}
        }
      };
      testSchema.properties.foo = testSchema;

      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { mutable: true });

      expect(mockMutation).toHaveBeenCalledWith(testSchema, true, "$");
      expect(mockMutation).not.toHaveBeenCalledWith(testSchema, false, "$");
    });

    it("true when the cycle is inside oneOf", () => {
      const testSchema = {
        title: "a",
        oneOf: [{
          title: "b",
          type: "object",
          properties: {
            a: {}
          }
        }]
      };
      testSchema.oneOf[0].properties.a = testSchema;

      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { mutable: false });

      expect(mockMutation).toHaveBeenCalledWith(testSchema, true, "$");
      expect(mockMutation).not.toHaveBeenCalledWith(testSchema, false, "$");
    });
  });

  describe("bfs", () => {
    it("call order is correct for nested objects and arrays", () => {
      const testSchema = {
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
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { bfs: true, });

      const expectedPath1 = "$.properties.foo.items[0]";
      const expectedPath2 = "$.properties.foo.items[1]";
      expect(mockMutation).nthCalledWith(1, testSchema, false, "$");
      expect(mockMutation).nthCalledWith(2, testSchema.properties.foo, false, "$.properties.foo");
      expect(mockMutation).nthCalledWith(3, testSchema.properties.foo.items[0], false, expectedPath1);
      expect(mockMutation).nthCalledWith(4, testSchema.properties.foo.items[1], false, expectedPath2);
    });

    it("works with mutable settings", () => {
      const testSchema = {
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
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { bfs: true, mutable: true });

      const expectedPath1 = "$.properties.foo.items[0]";
      const expectedPath2 = "$.properties.foo.items[1]";
      expect(mockMutation).nthCalledWith(1, testSchema, false, "$");
      expect(mockMutation).nthCalledWith(2, testSchema.properties.foo, false, "$.properties.foo");
      expect(mockMutation).nthCalledWith(3, testSchema.properties.foo.items[0], false, expectedPath1);
      expect(mockMutation).nthCalledWith(4, testSchema.properties.foo.items[1], false, expectedPath2);
    });
  });
});

describe("Mutability settings", () => {
  it("defaults to being immutable", () => {
    const s = {
      type: "object",
      properties: {
        foo: { type: "string" },
        bar: { type: "number" }
      }
    } as JSONSchema;

    const frozenS = Object.freeze(s);

    const result = traverse(frozenS, () => {
      return { hello: "world" };
    });

    expect(frozenS).not.toBe(result);
    expect(frozenS).not.toBe(result);
  });

  describe("mutable: false", () => {
    it("cycles are preserved, but reference is not the same as original", () => {
      const s = {
        type: "object",
        properties: {
          foo: {},
        }
      };
      s.properties.foo = s;

      const frozenS = Object.freeze(s);

      const result = traverse(frozenS as JSONSchema, (ss) => ss, { mutable: false }) as JSONSchemaObject;

      expect(frozenS).not.toBe(result);
      expect((result.properties as Properties).foo).toBe(result);
      expect(frozenS.properties.foo).not.toBe(result);
      expect(frozenS.properties.foo).toEqual(result);
      expect(frozenS.properties.foo).toEqual(frozenS);
    });

    it("a copy of the first schema is given even when skipFirstMutation is used", () => {
      const s = {
        type: "object",
        properties: {
          foo: { type: "string" },
        }
      };

      const frozenS = Object.freeze(s);

      const result = traverse(frozenS as JSONSchema, (ss) => ss, { mutable: false, skipFirstMutation: true }) as JSONSchemaObject;

      expect(frozenS).not.toBe(result);
      expect((result.properties as Properties).foo).not.toBe(frozenS.properties.foo);
      expect((result.properties as Properties).foo).toEqual(frozenS.properties.foo);
    });

    it("returns a deep copy when bfs is used (IE bfs doesn't change the behavior)", () => {
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

      const frozenS = Object.freeze(s);

      const result = traverse(frozenS as JSONSchema, (ss) => {
        if (ss === true || ss === false) { return ss; }
        return { hello: "world", ...ss };
      }, { mutable: false, bfs: true }) as JSONSchemaObject;

      expect(frozenS).not.toBe(result);
      expect(result.hello).toBe("world");
      expect((result.properties as Properties).foo).not.toBe(frozenS.properties.foo);
      expect((result.properties as Properties).foo.items[0]).not.toBe(frozenS.properties.foo.items[0]);

      expect((result.properties as Properties).foo.hello).toBe("world");
      expect((result.properties as Properties).foo.items[0].hello).toBe("world");
      expect((result.properties as Properties).foo.items[1].hello).toBe("world");
    });

    it("skipFirstMutation and bfs combined also has no effect on mutability", () => {
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

      const frozenS = Object.freeze(s);

      const result = traverse(frozenS as JSONSchema, (ss) => {
        if (ss === true || ss === false) { return ss; }
        return { hello: "world", ...ss };
      }, { mutable: false, bfs: true, skipFirstMutation: true }) as JSONSchemaObject;

      expect(frozenS).not.toBe(result);
      expect(result.hello).not.toBeDefined();
      expect((result.properties as Properties).foo).not.toBe(frozenS.properties.foo);
      expect((result.properties as Properties).foo.items[0]).not.toBe(frozenS.properties.foo.items[0]);

      expect((result.properties as Properties).foo.hello).toBe("world");
      expect((result.properties as Properties).foo.items[0].hello).toBe("world");
      expect((result.properties as Properties).foo.items[1].hello).toBe("world");
    });
  });

  describe("mutable: true", () => {
    it("cycles are preserved, reference is the same as original", () => {
      const s = {
        type: "object",
        properties: {
          foo: {},
        }
      };
      s.properties.foo = s;


      const result = traverse(s as JSONSchema, (ss) => ss, { mutable: true }) as JSONSchemaObject;

      expect(s).toBe(result);
      expect((result.properties as Properties).foo).toBe(result);
      expect(s.properties.foo).toBe(s);
      expect((result.properties as Properties).foo).toBe(s);
    });

    it("the first schema is returned unmutated when skipFirstMutation is used", () => {
      const s = {
        type: "object",
        properties: {
          foo: { type: "string" },
        }
      };

      const result = traverse(s as JSONSchema, (ss: any) => { ss.hello = "world"; return ss; }, { mutable: true, skipFirstMutation: true }) as JSONSchemaObject;

      expect(s).toBe(result);
      expect((s as any).hello).not.toBeDefined();
      expect((s.properties.foo as any).hello).toBe("world")
    });

    it("bfs also preserves refs", () => {
      const s = {
        type: "object",
        properties: {
          foo: { type: "string" },
        }
      };

      const result = traverse(s as JSONSchema, (ss: any) => { ss.hello = "world"; return ss; }, { mutable: true, bfs: true }) as JSONSchemaObject;

      expect(s).toBe(result);
      expect((s as any).hello).toBe("world");
      expect((s.properties.foo as any).hello).toBe("world")
      expect((result.properties as Properties).foo).toBe(s.properties.foo);
    });
  });
});
