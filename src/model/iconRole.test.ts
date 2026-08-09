import { describe, expect, it } from "vitest";
import { iconRole, iconVendor } from "./iconRole";

describe("what an imported icon becomes when it is added", () => {
  it("makes a group of the things other things go inside", () => {
    for (const name of [
      "virtual-networks",
      "virtual-networks-classic",
      "subnet",
      "azure-subnets",
      "vpc",
      "resource-groups",
      "subscriptions",
      "management-groups",
      "availability-zone",
      "kubernetes-cluster",
      "namespace",
      "region",
    ]) {
      expect(iconRole(name), name).toBe("group");
    }
  });

  it("leaves everything else a single node", () => {
    for (const name of [
      "virtual-machine",
      "function-apps",
      "sql-database",
      "storage-accounts",
      "network-security-groups",
      "load-balancers",
      "key-vaults",
    ]) {
      expect(iconRole(name), name).toBe("service");
    }
  });

  it("matches whole words, not fragments of longer ones", () => {
    // A status page about subnetworks is not a container.
    expect(iconRole("subnetwork-peering-status")).toBe("service");
    expect(iconRole("regional-settings")).toBe("service");
  });
});

describe("whose icon it is", () => {
  it("reads the folder a vendor ships it in", () => {
    expect(iconVendor("Azure_Public_Service_Icons/Icons/networking/x.svg")).toBe("azure");
    expect(iconVendor("src/main/webapp/img/lib/azure2/networking/Subnet.svg")).toBe("azure");
    expect(iconVendor("img/lib/aws4/storage/S3.svg")).toBe("aws");
    expect(iconVendor("icons/gcp/compute/vm.svg")).toBe("gcp");
    expect(iconVendor("packs/kubernetes/control-plane.svg")).toBe("kubernetes");
  });

  it("reads a URL the same way", () => {
    expect(
      iconVendor(
        "https://raw.githubusercontent.com/jgraph/drawio/dev/src/main/webapp/img/lib/azure2/networking/Virtual_Networks.svg",
      ),
    ).toBe("azure");
  });

  it("knows Microsoft's numbering, which survives a file dialog", () => {
    // Picked one by one, a file arrives with no folder at all.
    expect(iconVendor("02068-icon-service-Virtual-Networks.svg")).toBe("azure");
  });

  it("does not file a diagram by a word in its name", () => {
    expect(iconVendor("my-aws-notes.svg")).toBe("other");
    expect(iconVendor("drawings/azure-plan-v2.svg")).toBe("other");
  });

  it("says 'other' rather than guessing", () => {
    expect(iconVendor("icons/thing.svg")).toBe("other");
    expect(iconVendor("")).toBe("other");
  });
});
