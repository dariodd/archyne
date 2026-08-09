import { describe, expect, it } from "vitest";
import { unzlibSync } from "fflate";
import { buildPdf, pdfDataUrl, type PdfImage } from "./pdf";

/** A `w × h` image of one flat colour, with an optional flat alpha. */
function solid(w: number, h: number, rgb: [number, number, number], a?: number): PdfImage {
  const pixels = new Uint8Array(w * h * 3);
  for (let i = 0; i < w * h; i++) pixels.set(rgb, i * 3);
  return {
    rgb: pixels,
    width: w,
    height: h,
    ...(a === undefined ? {} : { alpha: new Uint8Array(w * h).fill(a) }),
  };
}

const text = (pdf: Uint8Array) => new TextDecoder("latin1").decode(pdf);

/** The `/MediaBox [0 0 w h]` the page declares. */
function mediaBox(pdf: Uint8Array): [number, number] {
  const m = text(pdf).match(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/);
  if (!m) throw new Error("no MediaBox");
  return [Number(m[1]), Number(m[2])];
}

/** The `cm` matrix in the content stream: scale x, scale y, offset x, offset y. */
function placement(pdf: Uint8Array): [number, number, number, number] {
  const m = text(pdf).match(/q ([\d.-]+) 0 0 ([\d.-]+) ([\d.-]+) ([\d.-]+) cm/);
  if (!m) throw new Error("no placement matrix");
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
}

describe("the PDF container", () => {
  it("starts with a header and ends with the end marker", () => {
    const pdf = buildPdf(solid(4, 4, [255, 0, 0]), { page: "fit", pixelRatio: 1 });
    expect(text(pdf).startsWith("%PDF-1.4\n")).toBe(true);
    expect(text(pdf).endsWith("%%EOF\n")).toBe(true);
  });

  it("points every cross-reference entry at the object it claims", () => {
    // The one thing in a PDF that cannot be checked by eye, and the one that
    // makes a reader reject the file outright when it is wrong.
    const pdf = buildPdf(solid(3, 2, [1, 2, 3], 128), { page: "fit", pixelRatio: 1 });
    const body = text(pdf);
    const table = body.slice(body.lastIndexOf("xref\n0 "));
    const [, count] = table.match(/xref\n0 (\d+)/)!;
    const entries = [...table.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));

    expect(entries).toHaveLength(Number(count) - 1);
    entries.forEach((offset, index) => {
      expect(body.slice(offset, offset + 10)).toMatch(new RegExp(`^${index + 1} 0 obj\n`));
    });
  });

  it("declares the offset the cross-reference table really starts at", () => {
    const pdf = buildPdf(solid(3, 2, [1, 2, 3]), { page: "fit", pixelRatio: 1 });
    const body = text(pdf);
    const startxref = Number(body.match(/startxref\n(\d+)/)![1]);
    expect(body.slice(startxref, startxref + 4)).toBe("xref");
  });

  it("names an /Info object that exists", () => {
    const pdf = buildPdf(solid(2, 2, [0, 0, 0], 10), { page: "fit", pixelRatio: 1 });
    const body = text(pdf);
    const info = Number(body.match(/\/Info (\d+) 0 R/)![1]);
    expect(body).toContain(`${info} 0 obj\n<< /Producer (Archyne)`);
  });
});

describe("the embedded image", () => {
  it("carries the pixels back out unchanged", () => {
    const image = solid(5, 3, [10, 200, 30]);
    const pdf = buildPdf(image, { page: "fit", pixelRatio: 1 });
    const body = text(pdf);
    const at = body.indexOf("/ColorSpace /DeviceRGB");
    const length = Number(body.slice(at).match(/\/Length (\d+)/)![1]);
    const start = body.indexOf("stream\n", at) + "stream\n".length;

    expect(unzlibSync(pdf.subarray(start, start + length))).toEqual(image.rgb);
  });

  it("writes no soft mask when the image is opaque", () => {
    const pdf = buildPdf(solid(2, 2, [255, 255, 255]), { page: "fit", pixelRatio: 1 });
    expect(text(pdf)).not.toContain("/SMask");
    expect(text(pdf)).not.toContain("/DeviceGray");
  });

  it("puts a transparent background in a soft mask", () => {
    const pdf = buildPdf(solid(2, 2, [255, 255, 255], 0), { page: "fit", pixelRatio: 1 });
    const body = text(pdf);
    const smask = Number(body.match(/\/SMask (\d+) 0 R/)![1]);
    expect(body).toContain(`${smask} 0 obj\n<< /Type /XObject`);
    expect(body).toContain("/ColorSpace /DeviceGray");
  });

  it("refuses an image whose pixel count and dimensions disagree", () => {
    const broken = { ...solid(4, 4, [0, 0, 0]), width: 5 };
    expect(() => buildPdf(broken, { page: "fit", pixelRatio: 1 })).toThrow(/RGB/);
  });
});

describe("placing the diagram on the page", () => {
  it("makes the page the size of the diagram", () => {
    // 96 CSS pixels is an inch, and an inch is 72 points.
    const pdf = buildPdf(solid(96, 48, [0, 0, 0]), { page: "fit", pixelRatio: 1 });
    expect(mediaBox(pdf)).toEqual([72, 36]);
  });

  it("reads a 2× capture as the same paper size, at twice the detail", () => {
    const pdf = buildPdf(solid(192, 96, [0, 0, 0]), { page: "fit", pixelRatio: 2 });
    expect(mediaBox(pdf)).toEqual([72, 36]);
  });

  it("turns the paper landscape for a wide diagram", () => {
    const [w, h] = mediaBox(
      buildPdf(solid(800, 200, [0, 0, 0]), { page: "a4", pixelRatio: 1 }),
    );
    expect(w).toBeGreaterThan(h);
    expect(Math.round(w)).toBe(842);
  });

  it("keeps the paper portrait for a tall diagram", () => {
    const [w, h] = mediaBox(
      buildPdf(solid(200, 800, [0, 0, 0]), { page: "letter", pixelRatio: 1 }),
    );
    expect([w, h]).toEqual([612, 792]);
  });

  it("shrinks an oversized diagram inside the margins, keeping its shape", () => {
    const image = solid(4000, 2000, [0, 0, 0]);
    const pdf = buildPdf(image, { page: "a4", pixelRatio: 1 });
    const [pw, ph] = mediaBox(pdf);
    const [w, h, x, y] = placement(pdf);

    expect(w / h).toBeCloseTo(2, 2);
    expect(w).toBeLessThanOrEqual(pw - 72 + 0.01);
    expect(h).toBeLessThanOrEqual(ph - 72 + 0.01);
    // Centred: the margins left and right match, as do top and bottom.
    expect(x).toBeCloseTo(pw - w - x, 1);
    expect(y).toBeCloseTo(ph - h - y, 1);
  });

  it("never blows a small diagram up to fill the sheet", () => {
    const pdf = buildPdf(solid(96, 96, [0, 0, 0]), { page: "a4", pixelRatio: 1 });
    expect(placement(pdf).slice(0, 2)).toEqual([72, 72]);
  });
});

describe("the data URL", () => {
  it("is a base64 PDF that decodes back to the same bytes", () => {
    const pdf = buildPdf(solid(2, 2, [7, 8, 9]), { page: "fit", pixelRatio: 1 });
    const url = pdfDataUrl(pdf);
    expect(url.startsWith("data:application/pdf;base64,")).toBe(true);

    const decoded = Uint8Array.from(atob(url.slice(url.indexOf(",") + 1)), (c) =>
      c.charCodeAt(0),
    );
    expect(decoded).toEqual(pdf);
  });
});
