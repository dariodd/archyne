import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import pkg from "../../package.json";
import { AboutDialog } from "./AboutDialog";

afterEach(cleanup);

/**
 * The version shown to users has to be the version that was shipped.
 *
 * It was a literal in the component, so it went on saying 0.1.0 through
 * 0.2.0, 0.2.1 and 0.3.0 — nothing failed, because nothing was checking.
 * Reading the manifest here is the point: this test only passes while the
 * dialog and the released number are the same string, whatever that becomes.
 */
describe("About dialog", () => {
  it("reports the version in package.json", () => {
    render(<AboutDialog onClose={() => {}} />);
    expect(screen.getByText(`version ${pkg.version}`)).toBeTruthy();
  });
});
