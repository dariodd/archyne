import { describe, expect, it } from "vitest";
import {
  iconName,
  patchIconLibrary,
  readIconLibrary,
  stripIconLibrary,
  usedIcons,
} from "./iconLibrary";

const DIAGRAM = "architecture-beta\n  service vm(custom:azure-vnet)[VM]\n";
const ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0"/></svg>';

describe("naming an imported icon", () => {
  it("takes a vendor's filename and makes it referable", () => {
    expect(iconName("Virtual Networks (10061).svg")).toBe("virtual-networks");
    expect(iconName("Azure_Subnet.SVG")).toBe("azure-subnet");
  });

  it("drops the vendor's catalogue number and its word for 'icon'", () => {
    // Microsoft's pack, verbatim. What is left is what somebody searches for.
    expect(iconName("02068-icon-service-Virtual-Networks.svg")).toBe("virtual-networks");
    expect(iconName("00001-icon-service-Monitor.svg")).toBe("monitor");
    expect(iconName("10032-icon-service-Kubernetes-Services.svg")).toBe("kubernetes-services");
  });

  it("does not eat a number or the word 'service' that belongs to the name", () => {
    expect(iconName("365-defender.svg")).toBe("365-defender");
    expect(iconName("Service_Bus.svg")).toBe("service-bus");
    // Only the front is stripped, so a name that repeats the word keeps it.
    expect(iconName("00042-icon-service-Service-Fabric.svg")).toBe("service-fabric");
  });

  it("takes the file out of a path or a URL, since that is what callers pass", () => {
    expect(
      iconName("Azure_Public_Service_Icons/Icons/networking/02068-Virtual-Networks.svg"),
    ).toBe("virtual-networks");
    expect(iconName("https://cdn.example/pack/vnet.svg?v=2")).toBe("vnet");
    expect(iconName("C:\\icons\\Subnet.svg")).toBe("subnet");
  });

  it("never yields an empty name", () => {
    expect(iconName("   ")).toBe("icon");
    expect(iconName("©")).toBe("icon");
  });

  it("keeps names short enough to read in the file", () => {
    expect(iconName("a".repeat(80)).length).toBeLessThanOrEqual(40);
  });
});

describe("carrying icons in the diagram", () => {
  it("finds nothing in a file that has none", () => {
    expect(readIconLibrary(DIAGRAM)).toBeNull();
  });

  it("comes back out the way it went in", () => {
    const code = patchIconLibrary(DIAGRAM, { "azure-vnet": ICON });
    const back = readIconLibrary(code);
    expect(Object.keys(back!)).toEqual(["azure-vnet"]);
    expect(back!["azure-vnet"]).toContain("<path");
  });

  it("cleans what it reads, not only what it writes", () => {
    // A file may have been written by anything at all.
    const dirty = `${DIAGRAM}%% graph:icons {"x":"<svg xmlns=\\"http://www.w3.org/2000/svg\\"><script>alert(1)</script><path d=\\"M0 0\\"/></svg>"}\n`;
    const back = readIconLibrary(dirty);
    expect(back!.x).not.toContain("script");
    expect(back!.x).toContain("<path");
  });

  it("drops an entry that is not an icon at all", () => {
    const code = `${DIAGRAM}%% graph:icons {"x":"<html/>","y":42}\n`;
    expect(readIconLibrary(code)).toEqual({});
  });

  it("survives a line that is not JSON", () => {
    expect(readIconLibrary(`${DIAGRAM}%% graph:icons {oops\n`)).toBeNull();
  });

  it("leaves no line when the library is empty", () => {
    expect(patchIconLibrary(DIAGRAM, {})).not.toContain("graph:icons");
  });

  it("replaces the line rather than stacking another up", () => {
    const once = patchIconLibrary(DIAGRAM, { a: ICON });
    const twice = patchIconLibrary(once, { a: ICON, b: ICON });
    expect(twice.match(/graph:icons/g)).toHaveLength(1);
    expect(twice).toContain('"b"');
  });

  it("strips the line without disturbing the diagram", () => {
    const code = patchIconLibrary(DIAGRAM, { a: ICON });
    expect(stripIconLibrary(code).trim()).toBe(DIAGRAM.trim());
  });
});

describe("keeping only the icons still in use", () => {
  const library = { kept: ICON, gone: ICON };

  it("keeps the ones a node refers to", () => {
    expect(Object.keys(usedIcons(library, ["custom:kept", "logos:azure"]))).toEqual(["kept"]);
  });

  it("drops the ones nothing refers to any more", () => {
    expect(usedIcons(library, [])).toEqual({});
  });

  it("ignores references to the bundled collections", () => {
    expect(usedIcons(library, ["carbon:subnet-acl-rules"])).toEqual({});
  });
});
