import traverse from "./";
import { JSONSchema, JSONSchemaObject } from "@json-schema-tools/meta-schema";

describe.each([false, true])("skipped-root items path with mutable=%s", (mutable) => {
  it.each([false, true])("identifies the items edge with bfs=%s", (bfs) => {
    const root: JSONSchemaObject = {};
    root.items = root;
    const calls: Array<{ isCycle: boolean; path: string }> = [];
    const mutation = jest.fn((node: JSONSchema, isCycle: boolean, path: string) => {
      calls.push({ isCycle, path });
      return node;
    });

    traverse(root, mutation, { mutable, bfs, skipFirstMutation: true });

    expect(mutation).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ isCycle: true, path: "$.items" }]);
  });
});
