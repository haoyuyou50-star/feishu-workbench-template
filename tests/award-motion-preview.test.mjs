import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardUrl = new URL("../dashboard/main.jsx", import.meta.url);

test("keeps one award dialog shell mounted while detail changes to editor", async () => {
  const dashboard = await readFile(dashboardUrl, "utf8");
  assert.match(dashboard, /selectedAward && <AwardRecordDialog[^>]+readOnly=\{!awardEditing\}/);
  assert.match(dashboard, /award-record-flow-dialog/);
  assert.match(dashboard, /readOnly \? <div key="detail"[^>]+award-dialog-pane is-detail/);
  assert.match(dashboard, /<form key="editor" className="award-dialog-pane is-editor"/);
  assert.match(dashboard, /onClick=\{onEdit\}><Pencil/);
  assert.doesNotMatch(dashboard, /awardEditTarget/);
  assert.doesNotMatch(dashboard, /requestClose\(\); window\.setTimeout\(\(\) => onEdit/);
});
