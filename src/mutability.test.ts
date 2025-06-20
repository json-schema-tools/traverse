import traverse from "./";
import { Properties, JSONSchemaObject, JSONSchema } from "@json-schema-tools/meta-schema";

describe("traverse mutability", () => {
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
