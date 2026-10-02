import { JSONSchema } from "@json-schema-tools/meta-schema";

export const testCalls = (
  mockMutation: unknown,
  schema: JSONSchema,
  isCycle: unknown = expect.any(Boolean),
  nth?: number,
  parent: unknown = expect.anything(),
) => {
  if (parent === false) { parent = undefined; }
  if (nth) {
    expect(mockMutation).toHaveBeenNthCalledWith(
      nth,
      schema,
      isCycle,
      expect.any(String),
      parent
    );
  } else {
    expect(mockMutation).toHaveBeenCalledWith(
      schema,
      isCycle,
      expect.any(String),
      parent
    );
  }
};
