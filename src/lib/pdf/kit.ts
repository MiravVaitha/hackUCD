import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

/**
 * A small layout helper over pdf-lib: flowing text, key/value blocks, tables
 * and images on A4 pages with automatic page breaks. Pure JavaScript, so it
 * runs unchanged in serverless functions.
 *
 * Stripe asks for evidence documents in 12 pt or larger, so the dispute
 * packets use `baseSize: 12`. Internal reports can go smaller.
 */

const A4 = { width: 595.28, height: 841.89 };
const MARGIN_X = 50;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;

const INK = rgb(0.04, 0.07, 0.13);
const MUTED = rgb(0.36, 0.41, 0.53);
const RULE = rgb(0.85, 0.86, 0.9);
const TINT = rgb(0.96, 0.96, 0.975);

// Characters the standard PDF fonts can encode beyond Latin-1.
const WIN_ANSI_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

const REPLACEMENTS: Record<string, string> = {
  "→": "->", // right arrow
  "←": "<-", // left arrow
  "✓": "yes", // check mark
  "✗": "no", // ballot x
  "≥": ">=",
  "≤": "<=",
  " ": " ", // no-break space
  " ": " ", // thin space
  " ": " ", // narrow no-break space
  "‑": "-", // non-breaking hyphen
  "−": "-", // minus sign
};

/** Make text safe for the standard fonts: unsupported characters become "?". */
export function toWinAnsi(input: string): string {
  let output = "";
  for (const character of input.normalize("NFC")) {
    if (character in REPLACEMENTS) {
      output += REPLACEMENTS[character];
      continue;
    }
    const code = character.codePointAt(0) ?? 0;
    if (character === "\n" || character === "\t") output += character === "\t" ? "  " : "\n";
    else if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRAS.has(code)) {
      output += character;
    } else if (code < 0x20) {
      // Drop other control characters.
    } else {
      output += "?";
    }
  }
  return output;
}

export type PdfImageInput = { bytes: Uint8Array; mime: string; caption?: string };

export type PdfBuilderOptions = {
  title: string;
  /** Printed at the bottom left of every page. */
  footer: string;
  baseSize?: number;
  author?: string;
  subject?: string;
};

export class PdfBuilder {
  private page!: PDFPage;
  private y = 0;
  private readonly width = A4.width - MARGIN_X * 2;

  private constructor(
    private readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly bold: PDFFont,
    private readonly mono: PDFFont,
    private readonly options: Required<Pick<PdfBuilderOptions, "title" | "footer" | "baseSize">>,
  ) {
    this.addPage();
  }

  static async create(options: PdfBuilderOptions): Promise<PdfBuilder> {
    const doc = await PDFDocument.create();
    doc.setTitle(toWinAnsi(options.title));
    doc.setAuthor(toWinAnsi(options.author ?? "Verity"));
    doc.setCreator("Verity");
    doc.setProducer("Verity");
    if (options.subject) doc.setSubject(toWinAnsi(options.subject));
    doc.setCreationDate(new Date());

    const [regular, bold, mono] = await Promise.all([
      doc.embedFont(StandardFonts.Helvetica),
      doc.embedFont(StandardFonts.HelveticaBold),
      doc.embedFont(StandardFonts.Courier),
    ]);
    return new PdfBuilder(doc, regular, bold, mono, {
      title: options.title,
      footer: options.footer,
      baseSize: options.baseSize ?? 11,
    });
  }

  get pageCount(): number {
    return this.doc.getPageCount();
  }

  get baseSize(): number {
    return this.options.baseSize;
  }

  private addPage(): void {
    this.page = this.doc.addPage([A4.width, A4.height]);
    this.y = A4.height - MARGIN_TOP;
  }

  /** Start a new page unless the current one is still empty. */
  pageBreak(): void {
    if (this.y < A4.height - MARGIN_TOP - 1) this.addPage();
  }

  private ensure(height: number): void {
    if (this.y - height < MARGIN_BOTTOM) this.addPage();
  }

  private wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const lines: string[] = [];
    for (const paragraph of toWinAnsi(text).split("\n")) {
      if (paragraph.trim() === "") {
        lines.push("");
        continue;
      }
      let line = "";
      for (const rawWord of paragraph.split(/\s+/).filter(Boolean)) {
        // Break anything too long to fit on a line by itself, such as a hash.
        const pieces: string[] = [];
        let word = rawWord;
        while (font.widthOfTextAtSize(word, size) > maxWidth && word.length > 1) {
          let cut = word.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(word.slice(0, cut), size) > maxWidth) cut--;
          pieces.push(word.slice(0, cut));
          word = word.slice(cut);
        }
        pieces.push(word);

        for (const piece of pieces) {
          const candidate = line ? `${line} ${piece}` : piece;
          if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
            line = candidate;
          } else {
            if (line) lines.push(line);
            line = piece;
          }
        }
      }
      lines.push(line);
    }
    return lines;
  }

  private drawLines(
    lines: string[],
    options: { font: PDFFont; size: number; color?: ReturnType<typeof rgb>; x?: number; lineGap?: number },
  ): void {
    const lineHeight = options.size * (options.lineGap ?? 1.38);
    for (const line of lines) {
      this.ensure(lineHeight);
      this.y -= lineHeight;
      if (line) {
        this.page.drawText(line, {
          x: options.x ?? MARGIN_X,
          y: this.y + options.size * 0.28,
          size: options.size,
          font: options.font,
          color: options.color ?? INK,
        });
      }
    }
  }

  spacer(height = 8): void {
    this.y -= height;
  }

  rule(): void {
    this.ensure(10);
    this.y -= 5;
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: MARGIN_X + this.width, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.y -= 5;
  }

  title(text: string, subtitle?: string): void {
    const size = this.options.baseSize + 9;
    this.drawLines(this.wrap(text, this.bold, size, this.width), { font: this.bold, size, lineGap: 1.2 });
    if (subtitle) {
      this.spacer(2);
      this.drawLines(this.wrap(subtitle, this.regular, this.options.baseSize, this.width), {
        font: this.regular,
        size: this.options.baseSize,
        color: MUTED,
      });
    }
    this.spacer(6);
  }

  heading(text: string): void {
    const size = this.options.baseSize + 3;
    // Keep a heading together with at least a couple of lines of what follows.
    this.ensure(size * 1.4 + this.options.baseSize * 3.2 + 14);
    this.spacer(12);
    this.drawLines(this.wrap(text, this.bold, size, this.width), { font: this.bold, size, lineGap: 1.25 });
    this.y -= 3;
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: MARGIN_X + this.width, y: this.y },
      thickness: 0.7,
      color: RULE,
    });
    this.spacer(6);
  }

  subheading(text: string): void {
    const size = this.options.baseSize + 0.5;
    this.ensure(size * 1.4 + this.options.baseSize * 2);
    this.spacer(6);
    this.drawLines(this.wrap(text, this.bold, size, this.width), { font: this.bold, size });
    this.spacer(1);
  }

  paragraph(text: string, options: { muted?: boolean; bold?: boolean; size?: number } = {}): void {
    const size = options.size ?? this.options.baseSize;
    const font = options.bold ? this.bold : this.regular;
    this.drawLines(this.wrap(text, font, size, this.width), {
      font,
      size,
      color: options.muted ? MUTED : INK,
    });
    this.spacer(4);
  }

  /** Small grey text, for provenance notes. Not for evidence the reader must read. */
  note(text: string): void {
    const size = Math.max(8.5, this.options.baseSize - 2.5);
    this.drawLines(this.wrap(text, this.regular, size, this.width), { font: this.regular, size, color: MUTED });
    this.spacer(3);
  }

  monoLine(text: string): void {
    const size = Math.max(8, this.options.baseSize - 3);
    this.drawLines(this.wrap(text, this.mono, size, this.width), { font: this.mono, size, color: MUTED });
  }

  bullets(items: string[]): void {
    const size = this.options.baseSize;
    const indent = 14;
    for (const item of items) {
      const lines = this.wrap(item, this.regular, size, this.width - indent);
      const lineHeight = size * 1.38;
      this.ensure(lineHeight);
      this.page.drawText("•", { x: MARGIN_X + 2, y: this.y - lineHeight + size * 0.28, size, font: this.regular, color: MUTED });
      this.drawLines(lines, { font: this.regular, size, x: MARGIN_X + indent });
      this.spacer(2);
    }
    this.spacer(2);
  }

  /** Label and value rows. Labels sit in a fixed left column. */
  keyValues(rows: [label: string, value: string | null | undefined][], labelWidth = 150): void {
    const size = this.options.baseSize;
    const lineHeight = size * 1.38;
    for (const [label, rawValue] of rows) {
      const value = rawValue === null || rawValue === undefined || rawValue === "" ? "Not recorded" : rawValue;
      const labelLines = this.wrap(label, this.regular, size, labelWidth - 8);
      const valueLines = this.wrap(value, this.regular, size, this.width - labelWidth);
      const rowLines = Math.max(labelLines.length, valueLines.length);
      this.ensure(rowLines * lineHeight + 3);
      const top = this.y;
      labelLines.forEach((line, index) => {
        this.page.drawText(line, {
          x: MARGIN_X,
          y: top - (index + 1) * lineHeight + size * 0.28,
          size,
          font: this.regular,
          color: MUTED,
        });
      });
      valueLines.forEach((line, index) => {
        this.page.drawText(line, {
          x: MARGIN_X + labelWidth,
          y: top - (index + 1) * lineHeight + size * 0.28,
          size,
          font: this.regular,
          color: INK,
        });
      });
      this.y = top - rowLines * lineHeight - 3;
    }
    this.spacer(4);
  }

  /** A simple table. `widths` are fractions of the page width and should sum to 1. */
  table(headers: string[], rows: string[][], widths: number[], options: { size?: number } = {}): void {
    const size = options.size ?? Math.max(9, this.options.baseSize - 1.5);
    const lineHeight = size * 1.35;
    const padding = 4;
    const columnWidths = widths.map((fraction) => fraction * this.width);
    const columnX = columnWidths.map((_, index) =>
      MARGIN_X + columnWidths.slice(0, index).reduce((sum, value) => sum + value, 0),
    );

    const drawRow = (cells: string[], font: PDFFont, shaded: boolean) => {
      const wrapped = cells.map((cell, index) => this.wrap(cell ?? "", font, size, columnWidths[index] - padding * 2));
      const height = Math.max(...wrapped.map((lines) => lines.length)) * lineHeight + padding * 2;
      this.ensure(height);
      const top = this.y;
      if (shaded) {
        this.page.drawRectangle({ x: MARGIN_X, y: top - height, width: this.width, height, color: TINT });
      }
      wrapped.forEach((lines, column) => {
        lines.forEach((line, index) => {
          this.page.drawText(line, {
            x: columnX[column] + padding,
            y: top - padding - (index + 1) * lineHeight + size * 0.3,
            size,
            font,
            color: INK,
          });
        });
      });
      this.page.drawLine({
        start: { x: MARGIN_X, y: top - height },
        end: { x: MARGIN_X + this.width, y: top - height },
        thickness: 0.5,
        color: RULE,
      });
      this.y = top - height;
    };

    const rowHeight = (cells: string[], font: PDFFont) => Math.max(...cells.map((cell, index) => this.wrap(cell ?? "", font, size, columnWidths[index] - padding * 2).length)) * lineHeight + padding * 2;
    const headerHeight = rowHeight(headers, this.bold);
    this.ensure(headerHeight + (rows[0] ? rowHeight(rows[0], this.regular) : 0));
    drawRow(headers, this.bold, true);
    for (const row of rows) {
      if (this.y - MARGIN_BOTTOM < rowHeight(row, this.regular)) {
        this.addPage();
        drawRow(headers, this.bold, true);
      }
      drawRow(row, this.regular, false);
    }
    this.spacer(8);
  }

  private async embed(image: PdfImageInput): Promise<PDFImage | null> {
    try {
      if (image.mime === "image/png") return await this.doc.embedPng(image.bytes);
      if (image.mime === "image/jpeg" || image.mime === "image/jpg") return await this.doc.embedJpg(image.bytes);
    } catch {
      // An unreadable image is reported in place rather than failing the document.
    }
    return null;
  }

  /** Images laid out side by side, scaled to fit, each with a caption. */
  async images(images: PdfImageInput[], options: { perRow?: number; maxHeight?: number } = {}): Promise<void> {
    const perRow = Math.max(1, Math.min(options.perRow ?? 2, images.length));
    const gap = 12;
    const cellWidth = (this.width - gap * (perRow - 1)) / perRow;
    const maxHeight = options.maxHeight ?? 210;
    const captionSize = Math.max(9, this.options.baseSize - 2);

    for (let start = 0; start < images.length; start += perRow) {
      const row = images.slice(start, start + perRow);
      const embedded = await Promise.all(row.map((image) => this.embed(image)));
      const sizes = embedded.map((image) => {
        if (!image) return { width: cellWidth, height: 40 };
        const scale = Math.min(cellWidth / image.width, maxHeight / image.height, 1);
        return { width: image.width * scale, height: image.height * scale };
      });
      const captions = row.map((image) => this.wrap(image.caption ?? "", this.regular, captionSize, cellWidth));
      const rowHeight =
        Math.max(...sizes.map((size) => size.height)) +
        Math.max(...captions.map((lines) => lines.length)) * captionSize * 1.35 +
        10;
      this.ensure(rowHeight);

      const top = this.y;
      row.forEach((_, index) => {
        const x = MARGIN_X + index * (cellWidth + gap);
        const image = embedded[index];
        const size = sizes[index];
        if (image) {
          this.page.drawImage(image, { x, y: top - size.height, width: size.width, height: size.height });
        } else {
          this.page.drawRectangle({ x, y: top - size.height, width: size.width, height: size.height, color: TINT });
          this.page.drawText("Image could not be embedded", {
            x: x + 8,
            y: top - size.height / 2 - 4,
            size: captionSize,
            font: this.regular,
            color: MUTED,
          });
        }
        captions[index].forEach((line, lineIndex) => {
          this.page.drawText(line, {
            x,
            y: top - size.height - 6 - (lineIndex + 1) * captionSize * 1.35 + captionSize * 0.3,
            size: captionSize,
            font: this.regular,
            color: MUTED,
          });
        });
      });
      this.y = top - rowHeight;
    }
    this.spacer(4);
  }

  /** Add page footers and return the finished document. */
  async finish(): Promise<Uint8Array> {
    const pages = this.doc.getPages();
    const size = 8.5;
    const footer = toWinAnsi(this.options.footer);
    pages.forEach((page, index) => {
      const label = `Page ${index + 1} of ${pages.length}`;
      page.drawLine({
        start: { x: MARGIN_X, y: MARGIN_BOTTOM - 14 },
        end: { x: MARGIN_X + this.width, y: MARGIN_BOTTOM - 14 },
        thickness: 0.5,
        color: RULE,
      });
      page.drawText(footer, { x: MARGIN_X, y: MARGIN_BOTTOM - 28, size, font: this.regular, color: MUTED });
      page.drawText(label, {
        x: MARGIN_X + this.width - this.regular.widthOfTextAtSize(label, size),
        y: MARGIN_BOTTOM - 28,
        size,
        font: this.regular,
        color: MUTED,
      });
    });
    return this.doc.save();
  }
}
