import { JSONSchema } from "@json-schema-tools/meta-schema";

export const jsonPathStringify = (s: string[]): string => {
  return s
    .map((i) => {
      if (i === "") {
        return "$";
      } else {
        return `.${i}`;
      }
    })
    .join("");
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

export const last = (i: JSONSchema[], skip = 1): JSONSchema => {
  return i[i.length - skip];
};
