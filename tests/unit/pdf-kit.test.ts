import { describe, expect, it } from "vitest";

import { PdfBuilder, toWinAnsi } from "@/lib/pdf/kit";

describe("PDF text handling", () => {
  it("keeps Latin text, euro signs and typographic punctuation", () => {
    const text = "Saoirse Ní Dhomhnaill paid €107.95 – “thanks”…";
    expect(toWinAnsi(text)).toBe(text);
  });

  it("replaces characters the standard fonts cannot draw instead of failing", () => {
    expect(toWinAnsi("A → B")).toBe("A -> B");
    expect(toWinAnsi("done ✓")).toBe("done yes");
    expect(toWinAnsi("order 📦 placed")).toBe("order ? placed");
    expect(toWinAnsi("non\u00a0breaking")).toBe("non breaking");
  });

  it("drops control characters but keeps line breaks", () => {
    expect(toWinAnsi("line one\nline\u0000 two")).toBe("line one\nline two");
  });

  it("builds a multi-page document from long content without throwing", async () => {
    const pdf = await PdfBuilder.create({ title: "Test", footer: "Footer", baseSize: 12 });
    pdf.title("Evidence", "Subtitle");
    for (let section = 0; section < 6; section++) {
      pdf.heading(`Section ${section}`);
      pdf.paragraph("A sentence that is repeated to fill the page. ".repeat(40));
      pdf.keyValues([
        ["A long label that wraps", "f".repeat(64)],
        ["Missing", null],
      ]);
      pdf.table(
        ["ID", "Event"],
        Array.from({ length: 12 }, (_, row) => [`E${row}`, "Something happened 📦 here"]),
        [0.2, 0.8],
      );
    }
    const bytes = await pdf.finish();
    expect(pdf.pageCount).toBeGreaterThan(3);
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("reports an unreadable image in place rather than failing the document", async () => {
    const pdf = await PdfBuilder.create({ title: "Test", footer: "Footer" });
    await pdf.images([{ bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg", caption: "Broken" }]);
    const bytes = await pdf.finish();
    expect(bytes.length).toBeGreaterThan(500);
  });
});
