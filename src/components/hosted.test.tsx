import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { hostOwnsFile } from "../embed";
import { en } from "../i18n/en";
import { Toolbar } from "./Toolbar";

afterEach(() => {
  cleanup();
  delete (window as { acquireVsCodeApi?: unknown }).acquireVsCodeApi;
});

/** Pretend to be a VS Code webview, which is what `hostOwnsFile` looks for. */
function asWebview() {
  (window as { acquireVsCodeApi?: unknown }).acquireVsCodeApi = () => ({
    postMessage: () => {},
  });
}

/**
 * What Archyne offers when somebody else owns the file.
 *
 * The rule is not "hide the file menu" but a line between two kinds of
 * control: binding to a file, and editing the diagram in front of you. The
 * first belongs to the host — its Save is the real one — and the second is
 * still ours, because the host is saving whatever comes out of it.
 *
 * The document tabs are the part that is not cosmetic. A webview is bound to
 * one document, so switching to a second would send that one's text back as
 * an edit to the file the host still has open.
 */
describe("when a host owns the file", () => {
  it("is off by default, so the ordinary app is unaffected", () => {
    expect(hostOwnsFile()).toBe(false);
  });

  it("recognises a webview", () => {
    asWebview();
    expect(hostOwnsFile()).toBe(true);
  });

  // The labels come from the catalogue, so they are read from it rather than
  // spelled again here: a test that hardcodes "Save .mmd" starts failing the
  // day the wording improves, which teaches people to loosen the assertion.
  const label = (key: "toolbar.save" | "toolbar.open" | "toolbar.export") => en[key];

  it("offers Save and Open when nobody else does", () => {
    render(<Toolbar />);
    expect(screen.queryByText(label("toolbar.save"))).not.toBeNull();
    expect(screen.queryByText(label("toolbar.open"))).not.toBeNull();
  });

  it("withdraws Save and Open, which the host owns", () => {
    asWebview();
    render(<Toolbar />);
    expect(screen.queryByText(label("toolbar.save"))).toBeNull();
    expect(screen.queryByText(label("toolbar.open"))).toBeNull();
  });

  it("keeps Export, which is nobody else's", () => {
    asWebview();
    render(<Toolbar />);
    expect(screen.queryByText(label("toolbar.export"))).not.toBeNull();
  });
});
