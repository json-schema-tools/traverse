import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

const keywords = ["items", "additionalProperties", "unevaluatedProperties"] as const;
const replacements: JSONSchema[] = [true, { type: "string" }];

describe.each([false, true])("false subschemas with bfs=%s", bfs => {
  describe.each([false, true])("mutable=%s", mutable => {
    it.each(keywords)("visits and replaces false under %s", keyword => {
      for (const replacement of replacements) {
        const root: JSONSchemaObject = { [keyword]: false };
        if (!mutable) Object.freeze(root);
        const mutation = jest.fn((node: JSONSchema, _cycle: boolean, path: string) =>
          path === `$.${keyword}` ? replacement : node);

        const result = traverse(root, mutation, { bfs, mutable }) as JSONSchemaObject;

        expect(result[keyword]).toEqual(replacement);
        expect(mutation).toHaveBeenCalledTimes(2);
        expect(mutation).toHaveBeenCalledWith(false, false, `$.${keyword}`, result);
        expect(mutation.mock.calls.map(call => call[2])).toEqual(
          bfs ? ["$", `$.${keyword}`] : [`$.${keyword}`, "$"],
        );
        expect(result === root).toBe(mutable);
        expect(root[keyword]).toEqual(mutable ? replacement : false);
      }
    });

    it.each(keywords)("awaits a replacement of false under %s", async keyword => {
      const root: JSONSchemaObject = { [keyword]: false };
      const mutation = jest.fn(async (node: JSONSchema) => node === false ? true : node);

      const result = await traverse(root, mutation, { bfs, mutable }) as JSONSchemaObject;

      expect(result[keyword]).toBe(true);
      expect(mutation).toHaveBeenCalledTimes(2);
      expect(mutation).toHaveBeenCalledWith(false, false, `$.${keyword}`, result);
      expect(root[keyword]).toBe(mutable ? true : false);
    });
  });
});

it.each(keywords)("keeps false under %s when the callback returns it", keyword => {
  const root: JSONSchemaObject = { [keyword]: false };
  const mutation = jest.fn((node: JSONSchema) => node);

  expect(traverse(root, mutation)).toEqual(root);
  expect(mutation).toHaveBeenCalledTimes(2);
  expect(mutation).toHaveBeenCalledWith(false, false, `$.${keyword}`, expect.anything());
});

it.each(keywords)("skips missing and undefined %s", keyword => {
  for (const root of [{}, { [keyword]: undefined }]) {
    const mutation = jest.fn((node: JSONSchema) => node);

    const result = traverse(root, mutation);

    expect(result).toEqual(root);
    expect(mutation).toHaveBeenCalledTimes(1);
    expect(Object.prototype.hasOwnProperty.call(result, keyword)).toBe(
      Object.prototype.hasOwnProperty.call(root, keyword),
    );
  }
});

it("visits repeated false schemas at nested JSON Pointer paths when skipping the root", () => {
  const child = { items: false, additionalProperties: false, unevaluatedProperties: false };
  const root = { properties: { "a~/b": child } };
  const mutation = jest.fn((node: JSONSchema, _cycle: boolean, path: string) =>
    path === "/properties/a~0~1b" ? node : true);

  const result = traverse(root, mutation, {
    skipFirstMutation: true, pathFormat: "jsonpointer",
  }) as JSONSchemaObject;

  expect(mutation.mock.calls.map(call => call[2])).toEqual([
    "/properties/a~0~1b/items", "/properties/a~0~1b/additionalProperties",
    "/properties/a~0~1b/unevaluatedProperties", "/properties/a~0~1b",
  ]);
  expect(result.properties?.["a~/b"]).toEqual({
    items: true, additionalProperties: true, unevaluatedProperties: true,
  });
  expect(child).toEqual({ items: false, additionalProperties: false, unevaluatedProperties: false });
});
