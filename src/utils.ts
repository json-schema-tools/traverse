import { JSONSchema } from "@json-schema-tools/meta-schema";

export type PathSegment = string | number;

/** Format raw member names and array indices without interpreting names as syntax. */
export const jsonPathStringify = (segments: PathSegment[]): string => {
  return "$" + segments.map((segment) => {
    if (typeof segment === "number") {
      return `[${segment}]`;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment)) {
      return `.${segment}`;
    }
    return `[${JSON.stringify(segment)}]`;
  }).join("");
};

/** RFC 6901 string representation; the root is the empty string. */
export const jsonPointerStringify = (segments: PathSegment[]): string => {
  return segments.map((segment) => {
    return "/" + String(segment).replace(/~/g, "~0").replace(/\//g, "~1");
  }).join("");
};

export const isCycle = (
  s: JSONSchema,
  recursiveStack: JSONSchema[],
): JSONSchema | false => {
  const foundInRecursiveStack = recursiveStack.find((recSchema) => recSchema === s);
  if (foundInRecursiveStack) {
    return foundInRecursiveStack;
  }
  return false;
};

export const last = (i: JSONSchema[]): JSONSchema => {
  return i[i.length - 1];
};
