import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  countBulkIgnoredFiles,
  filterBulkProjectFiles,
  isBulkIgnoredFile,
  isBulkProjectFile,
} from "@/lib/evaluation-mode";

function mockFile(name: string, relativePath?: string): File {
  const file = new File(["x"], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  if (relativePath) {
    Object.defineProperty(file, "webkitRelativePath", { value: relativePath });
  }
  return file;
}

describe("bulk folder file filter", () => {
  it("acepta xlsx visibles y rechaza temporales ~$", () => {
    const valid = mockFile("Bitácora.xlsx", "Evaluador IGIP/Bitácora.xlsx");
    const lock = mockFile("~$Bitácora.xlsx", "Evaluador IGIP/~$Bitácora.xlsx");
    assert.equal(isBulkProjectFile(valid), true);
    assert.equal(isBulkIgnoredFile(lock), true);
    assert.equal(isBulkProjectFile(lock), false);
  });

  it("rechaza desktop.ini", () => {
    const ini = mockFile("desktop.ini", "Evaluador IGIP/desktop.ini");
    assert.equal(isBulkProjectFile(ini), false);
  });

  it("filtra 4 válidos de 5 incluyendo auxiliar", () => {
    const files = [
      mockFile("a.xlsx"),
      mockFile("b.xlsx"),
      mockFile("c.xlsx"),
      mockFile("d.xlsx"),
      mockFile("~$a.xlsx"),
    ];
    assert.equal(filterBulkProjectFiles(files).length, 4);
    assert.equal(countBulkIgnoredFiles(files), 1);
  });
});
