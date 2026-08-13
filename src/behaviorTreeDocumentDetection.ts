import { parseBehaviorTreeDocument } from "./core/parse";

export function isBtreeCpp4XmlSource(source: string): boolean {
  if (!/^\uFEFF?\s*<\?xml\b/.test(source)) {
    return false;
  }

  try {
    const document = parseBehaviorTreeDocument(source);
    const declaration = document.xmlDeclaration?.attributes;
    return (
      declaration?.version === "1.0" &&
      declaration.encoding?.toUpperCase() === "UTF-8" &&
      document.rootTagName === "root" &&
      document.rootAttributes.BTCPP_format === "4"
    );
  } catch (_error) {
    return false;
  }
}
