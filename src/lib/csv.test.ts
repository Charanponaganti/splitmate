import { describe, expect, it } from "vitest";
import { csvCell } from "./csv";

describe("csvCell", () => {
  it("quotes values containing separators", () => {
    expect(csvCell('Dinner, "fancy"')).toBe('"Dinner, ""fancy"""');
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell(1200)).toBe("1200");
  });

  it("neutralizes formula injection", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@cmd")).toBe("'@cmd");
  });
});
