import test from "node:test";
import assert from "node:assert/strict";
import { isBtreeCpp4XmlSource } from "../behaviorTreeDocumentDetection";

test("recognizes a UTF-8 BTCPP format 4 XML document", () => {
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="UTF-8"?>
<root BTCPP_format="4">
  <BehaviorTree ID="MainTree"><AlwaysSuccess /></BehaviorTree>
</root>`), true);
});

test("rejects ordinary XML and other BTCPP formats", () => {
  assert.equal(isBtreeCpp4XmlSource(`<root BTCPP_format="4" />`), false);
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="UTF-8"?><root />`), false);
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="3" />`), false);
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="GBK"?><root BTCPP_format="4" />`), false);
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="UTF-8"?><not-root BTCPP_format="4" />`), false);
});

test("rejects malformed BTCPP XML instead of auto-opening it", () => {
  assert.equal(isBtreeCpp4XmlSource(`<?xml version="1.0" encoding="UTF-8"?><root BTCPP_format="4">`), false);
});
