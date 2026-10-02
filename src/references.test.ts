import { JSONSchemaObject } from "@json-schema-tools/meta-schema";
import { reconnectReferences } from "./references";

describe("reconnectReferences", () => {
  it("redirects multiple entries while preserving the original shared container", () => {
    const original: JSONSchemaObject = { type: "string" };
    const replacement: JSONSchemaObject = { type: "number" };
    const properties = { first: original, second: original };
    const root: JSONSchemaObject = { properties };

    expect(reconnectReferences(root, new Map([[original, replacement]]))).toBe(root);
    expect(root.properties).toEqual({ first: replacement, second: replacement });
    expect(root.properties?.first).toBe(replacement);
    expect(root.properties?.second).toBe(replacement);
    expect(root.properties).not.toBe(properties);
    expect(properties.first).toBe(original);
    expect(properties.second).toBe(original);
  });
});
