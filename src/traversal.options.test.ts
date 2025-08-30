import traverse from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";
import { testCalls } from "./test-helpers";

describe("traverse", () => {
  describe("skipFirstMutation", () => {
    it("skips the first schema when the option skipFirstMutation is true", () => {
      const testSchema: any = { anyOf: [{}, {}] };
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema, mockMutation, { skipFirstMutation: true });

      testCalls(mockMutation, testSchema.anyOf[0]);
      testCalls(mockMutation, testSchema.anyOf[1]);
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


      testCalls(mockMutation1, testSchema1);
      expect(mockMutation1).toHaveBeenCalledTimes(1);
      expect((testSchema1.properties as Properties).skipFirstCycle).toBe(testSchema1);

      testCalls(mockMutation2, testSchema2);
      expect(mockMutation2).toHaveBeenCalledTimes(1);
      expect(testSchema2.items).toBe(testSchema2);

      expect(mockMutation1).toHaveBeenCalledTimes(1);
      expect(mockMutation1).toHaveBeenCalledWith(
        testSchema1.properties.skipFirstCycle,
        true,
        expect.any(String),
        testSchema1
      );

      expect(mockMutation2).toHaveBeenCalledTimes(1);
      expect(mockMutation2).toHaveBeenCalledWith(
        testSchema2.items,
        true,
        expect.any(String),
        testSchema2
      );
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
      } as any;
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { bfs: true, });

      testCalls(mockMutation, testSchema, false, 1, false);
      testCalls(mockMutation, testSchema.properties.foo, false, 2);
      testCalls(mockMutation, testSchema.properties.foo.items[0], false, 3);
      testCalls(mockMutation, testSchema.properties.foo.items[1], false, 4);
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
      } as any;
      const mockMutation = jest.fn((mockS) => mockS);

      traverse(testSchema as JSONSchema, mockMutation, { bfs: true, mutable: true });

      testCalls(mockMutation, testSchema, false, 1, false);
      testCalls(mockMutation, testSchema.properties.foo, false, 2);
      testCalls(mockMutation, testSchema.properties.foo.items[0], false, 3);
      testCalls(mockMutation, testSchema.properties.foo.items[1], false, 4);
    });

    it("handles basic cycles when bfs is true", () => {
      const schema = { type: "object", properties: { foo: {} } } as any;
      schema.properties.foo = schema;
      const mockMutation = jest.fn((s) => s);

      traverse(schema as JSONSchema, mockMutation, { bfs: true });

      expect(mockMutation).toHaveBeenCalledTimes(1);
    });

    it("handles chained cycles when bfs is true", () => {
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
      } as any;
      schema.properties.foo.items[0].items = schema;
      const mockMutation = jest.fn((s) => s);

      traverse(schema as JSONSchema, mockMutation, { bfs: true });

      expect(mockMutation).toHaveBeenCalledTimes(3);
    });

    it("bfs still calls mutation for root cycles when skipFirstMutation is true", () => {
      const schema: any = { title: "a", items: {} };
      schema.items = schema;
      const mockMutation = jest.fn((s) => s);

      traverse(schema as JSONSchema, mockMutation, { bfs: true, skipFirstMutation: true, mutable: true });

      expect(mockMutation).toHaveBeenCalledTimes(1);
      expect(mockMutation).toHaveBeenCalledWith(
        schema,
        true,
        expect.any(String),
        schema
      );
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
});
