import { JSONSchema } from "@json-schema-tools/meta-schema";

export const testCalls = (
  mockMutation: any,
  schema: JSONSchema,
  isCycle: any = expect.any(Boolean),
  nth?: number,
  parent: any = expect.anything(),
) => {
  if (parent === false) { parent = undefined; }
  if (nth) {
    expect(mockMutation).toHaveBeenNthCalledWith(
      nth,
      schema,
      isCycle,
      expect.any(String),
      parent,
    );
  } else {
    expect(mockMutation).toHaveBeenCalledWith(
      schema,
      isCycle,
      expect.any(String),
      parent,
    );
  }
};
