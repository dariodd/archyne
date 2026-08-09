import { describe, expect, it } from "vitest";
import {
  dataUrlToBlob,
  previewOptions,
  DEFAULT_EXPORT_OPTIONS,
  FORMAT_INFO,
  type ExportOptions,
} from "./export";

const withFormat = (format: ExportOptions["format"]): ExportOptions => ({
  ...DEFAULT_EXPORT_OPTIONS,
  format,
});

describe("what the preview renders", () => {
  it("leaves the raster and vector formats alone", () => {
    expect(previewOptions(withFormat("png")).format).toBe("png");
    expect(previewOptions(withFormat("svg")).format).toBe("svg");
  });

  it("previews a PDF as the image that will go on the page", () => {
    // Nothing displays a PDF in an <img>, and re-rendering for the download
    // would let the file differ from what was approved on screen.
    const opts = { ...withFormat("pdf"), page: "a4" as const, scale: 3 as const };
    expect(previewOptions(opts)).toEqual({ ...opts, format: "png" });
  });
});

describe("reading a data URL back", () => {
  it("decodes base64 to the original bytes", async () => {
    const blob = dataUrlToBlob("data:application/pdf;base64,JVBERi0=");
    expect(blob.type).toBe("application/pdf");
    expect(await blob.text()).toBe("%PDF-");
  });

  it("decodes the percent-encoded form the SVG export produces", async () => {
    const svg = "<svg><text>a & b</text></svg>";
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const blob = dataUrlToBlob(url);
    expect(blob.type).toBe("image/svg+xml");
    expect(await blob.text()).toBe(svg);
  });

  it("rejects anything that is not a data URL", () => {
    expect(() => dataUrlToBlob("https://example.com/x.png")).toThrow(/data URL/);
    expect(() => dataUrlToBlob("data:image/png;base64")).toThrow(/data URL/);
  });
});

describe("the formats on offer", () => {
  it("names a MIME type and extension for each", () => {
    for (const format of ["png", "svg", "pdf"] as const) {
      expect(FORMAT_INFO[format].extension).toBe(format);
      expect(FORMAT_INFO[format].mime).toMatch(/\//);
    }
  });
});
