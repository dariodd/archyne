/**
 * A single-page PDF around one raster image.
 *
 * Written by hand rather than pulled from a library: the only thing Archyne
 * needs to emit is one image on one page, and the two candidates (jsPDF, or
 * jsPDF plus svg2pdf for vector output) are together larger than the entire
 * initial bundle budget. The compression PDF wants — FlateDecode is a zlib
 * stream — is already in the build for the icon-pack importer.
 *
 * The output is a *raster* PDF: the diagram is embedded losslessly at the
 * chosen quality, not as vector paths. Vector would mean translating the
 * canvas to PDF drawing operators and embedding font subsets for every label,
 * which is a different project. At 3× the result is 288 dpi, which prints
 * cleanly; the SVG export remains the answer for anyone who needs to scale
 * without limit.
 */
import { zlibSync } from "fflate";

/** The page the diagram is placed on. */
export type PageSize = "fit" | "a4" | "letter";

export interface PdfImage {
  /** Packed RGB, three bytes per pixel, top row first. */
  rgb: Uint8Array;
  /** One byte per pixel; omitted when the image is fully opaque. */
  alpha?: Uint8Array;
  width: number;
  height: number;
}

export interface PdfOptions {
  page: PageSize;
  /**
   * Image pixels per CSS pixel — the export's quality setting. It fixes the
   * *physical* size of a "fit" page: a 2× capture of an 800px-wide diagram is
   * 1600px of data covering the same 600pt of paper.
   */
  pixelRatio: number;
}

/** CSS pixels are 96 per inch by definition; PDF units are 72 per inch. */
const PT_PER_PX = 72 / 96;

const PAPER: Record<Exclude<PageSize, "fit">, { width: number; height: number }> = {
  a4: { width: 595.28, height: 841.89 },
  letter: { width: 612, height: 792 },
};

/** Half an inch, matching what printers can reach on most hardware. */
const MARGIN_PT = 36;

function ascii(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function num(value: number): string {
  // Two decimals is finer than a PDF point can be seen at, and keeps the
  // xref offsets short. Avoid "-0", which some parsers dislike.
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** `D:YYYYMMDDHHmmSS+HH'mm'`, the date syntax in the PDF spec. */
function pdfDate(when: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const offset = -when.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `D:${when.getFullYear()}${p(when.getMonth() + 1)}${p(when.getDate())}` +
    `${p(when.getHours())}${p(when.getMinutes())}${p(when.getSeconds())}` +
    `${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`
  );
}

/** Escape the characters that would end a PDF literal string early. */
function pdfString(text: string): string {
  // Non-ASCII would need UTF-16BE with a byte-order mark; nothing here
  // produces any, so drop it rather than emit a string no reader can decode.
  const safe = text.replace(/[^\x20-\x7e]/g, "");
  return `(${safe.replace(/[\\()]/g, (c) => `\\${c}`)})`;
}

/**
 * Where the image sits on the page, in PDF units with the origin at the
 * bottom-left corner.
 */
function layout(image: PdfImage, opts: PdfOptions) {
  const wPt = (image.width / opts.pixelRatio) * PT_PER_PX;
  const hPt = (image.height / opts.pixelRatio) * PT_PER_PX;

  if (opts.page === "fit") {
    return { page: { width: wPt, height: hPt }, x: 0, y: 0, width: wPt, height: hPt };
  }

  // Turn the paper to match the diagram rather than shrinking a wide diagram
  // onto a portrait page — a landscape flowchart on A4 portrait wastes half
  // the sheet and comes out unreadably small.
  const paper = PAPER[opts.page];
  const page = wPt > hPt ? { width: paper.height, height: paper.width } : { ...paper };

  const room = { width: page.width - MARGIN_PT * 2, height: page.height - MARGIN_PT * 2 };
  // Only ever scale down: a small diagram blown up to fill A4 is a blurry
  // surprise, not a feature.
  const scale = Math.min(1, room.width / wPt, room.height / hPt);
  const width = wPt * scale;
  const height = hPt * scale;
  return {
    page,
    x: (page.width - width) / 2,
    y: (page.height - height) / 2,
    width,
    height,
  };
}

/** Build a one-page PDF holding `image`. */
export function buildPdf(image: PdfImage, opts: PdfOptions): Uint8Array {
  const expected = image.width * image.height * 3;
  if (image.rgb.length !== expected) {
    throw new Error(`expected ${expected} bytes of RGB, got ${image.rgb.length}`);
  }
  if (image.alpha && image.alpha.length !== image.width * image.height) {
    throw new Error("the alpha channel does not match the image size");
  }

  const box = layout(image, opts);
  const hasAlpha = !!image.alpha;
  // Object numbers are fixed, so the references below can be written inline.
  const IMAGE = 5;
  const SMASK = 6;
  const INFO = hasAlpha ? 7 : 6;

  const content = ascii(
    `q ${num(box.width)} 0 0 ${num(box.height)} ${num(box.x)} ${num(box.y)} cm /Im0 Do Q\n`,
  );
  const pixels = zlibSync(image.rgb, { level: 6 });

  const bodies: Uint8Array[][] = [
    [ascii("<< /Type /Catalog /Pages 2 0 R >>")],
    [ascii("<< /Type /Pages /Kids [3 0 R] /Count 1 >>")],
    [
      ascii(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(box.page.width)} ${num(box.page.height)}]` +
          ` /Resources << /XObject << /Im0 ${IMAGE} 0 R >> >> /Contents 4 0 R >>`,
      ),
    ],
    [ascii(`<< /Length ${content.length} >>\nstream\n`), content, ascii("endstream")],
    [
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
          ` /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode` +
          `${hasAlpha ? ` /SMask ${SMASK} 0 R` : ""} /Length ${pixels.length} >>\nstream\n`,
      ),
      pixels,
      ascii("\nendstream"),
    ],
  ];

  if (image.alpha) {
    const mask = zlibSync(image.alpha, { level: 6 });
    bodies.push([
      ascii(
        `<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height}` +
          ` /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode` +
          ` /Length ${mask.length} >>\nstream\n`,
      ),
      mask,
      ascii("\nendstream"),
    ]);
  }

  bodies.push([
    ascii(
      `<< /Producer ${pdfString("Archyne")} /Creator ${pdfString("Archyne")}` +
        ` /CreationDate ${pdfString(pdfDate(new Date()))} >>`,
    ),
  ]);

  // Serialise, recording where every object starts: the cross-reference
  // table is byte offsets, so this has to be assembled rather than joined.
  const out: Uint8Array[] = [];
  let at = 0;
  const write = (bytes: Uint8Array) => {
    out.push(bytes);
    at += bytes.length;
  };

  // The binary comment on the second line tells tools that move PDFs around
  // that this is not a text file to be newline-converted.
  write(ascii("%PDF-1.4\n"));
  write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(at);
    write(ascii(`${index + 1} 0 obj\n`));
    body.forEach(write);
    write(ascii("\nendobj\n"));
  });

  const xrefAt = at;
  const size = bodies.length + 1;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  write(ascii(xref));
  write(
    ascii(
      `trailer\n<< /Size ${size} /Root 1 0 R /Info ${INFO} 0 R >>\n` +
        `startxref\n${xrefAt}\n%%EOF\n`,
    ),
  );

  const pdf = new Uint8Array(at);
  let cursor = 0;
  for (const chunk of out) {
    pdf.set(chunk, cursor);
    cursor += chunk.length;
  }
  return pdf;
}

/** Base64 in chunks — one `String.fromCharCode` over a megabyte blows the stack. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const STEP = 0x8000;
  for (let i = 0; i < bytes.length; i += STEP) {
    binary += String.fromCharCode(...bytes.subarray(i, i + STEP));
  }
  return btoa(binary);
}

export function pdfDataUrl(pdf: Uint8Array): string {
  return `data:application/pdf;base64,${bytesToBase64(pdf)}`;
}
