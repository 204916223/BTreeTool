export function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&quot;", `"`)
    .replaceAll("&apos;", `'`)
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
