import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe, { type Result } from "axe-core";
import { Modal } from "./Modal";

afterEach(cleanup);

/**
 * Automated accessibility assertions.
 *
 * axe catches roughly a third of WCAG issues — it is a regression net, not a
 * conformance claim. The manual half (keyboard operation, announcements) is
 * covered by Modal.test.tsx and useKeyboardConnect.test.tsx.
 */
async function violations(container: HTMLElement): Promise<Result[]> {
  const results = await axe.run(container, {
    // jsdom has no layout, so anything measuring contrast or geometry is
    // meaningless here; those belong in a browser-driven pass.
    rules: {
      "color-contrast": { enabled: false },
      "target-size": { enabled: false },
    },
  });
  return results.violations;
}

function describeViolations(found: Result[]): string {
  return found.map((v) => `${v.id}: ${v.help}`).join("\n");
}

describe("accessibility", () => {
  it("the export-style dialog has no axe violations", async () => {
    const { container } = render(
      <Modal title="Export diagram" onClose={() => {}}>
        <div className="modal-body">
          <label>
            Format
            <select defaultValue="png">
              <option value="png">PNG</option>
              <option value="svg">SVG</option>
            </select>
          </label>
        </div>
        <div className="modal-actions">
          <button>Cancel</button>
          <button className="primary">Export PNG</button>
        </div>
      </Modal>,
    );
    const found = await violations(container);
    expect(describeViolations(found)).toBe("");
  });

  it("a dialog with a visually hidden title still has an accessible name", async () => {
    const { container } = render(
      <Modal title="About Archyne" onClose={() => {}} hideTitle>
        <p>Archyne is free software.</p>
        <div className="modal-actions">
          <button>Close</button>
        </div>
      </Modal>,
    );
    const found = await violations(container);
    expect(describeViolations(found)).toBe("");
  });

  it("icon-only buttons are not left unnamed", async () => {
    // The pattern that used to be broken: undo/redo rendered a bare glyph
    // with only a `title`, which is not reliably announced.
    const { container } = render(
      <div>
        <button aria-label="Undo">
          <span aria-hidden="true">↶</span>
        </button>
        <button aria-label="Redo">
          <span aria-hidden="true">↷</span>
        </button>
      </div>,
    );
    const found = await violations(container);
    expect(describeViolations(found)).toBe("");
  });

  it("catches a genuinely unnamed icon button", async () => {
    // Guards the guard: if axe were misconfigured these tests would pass
    // vacuously.
    const { container } = render(
      <button>
        <span aria-hidden="true">↶</span>
      </button>,
    );
    const found = await violations(container);
    expect(found.map((v) => v.id)).toContain("button-name");
  });
});
