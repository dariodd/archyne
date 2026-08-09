/**
 * What an imported icon *is*, and whose it is.
 *
 * A vendor's pack is a flat pile of pictures, but a diagram does not treat
 * them alike. A virtual network is something you put things *inside*; a
 * function app is something you put *in* one. Dropping every imported icon
 * on the canvas as the same kind of box made the containers useless — you
 * cannot draw an Azure topology if the VNet cannot hold the subnet — and
 * left everything in one undifferentiated heap in the palette.
 *
 * Both answers come from what the vendor already tells us: the name of the
 * file, and the folder it arrived in. Neither is authoritative, and this is
 * a judgement rather than a fact — so it decides only what an icon does when
 * it is *added*, which stays a group or a node the user can then change.
 */

/** The families the palette files icons under. */
export type IconVendor = "azure" | "aws" | "gcp" | "kubernetes" | "other";

export const VENDORS: IconVendor[] = ["azure", "aws", "gcp", "kubernetes", "other"];

/** Proper nouns, so they are not translated. "Other" is, by its caller. */
export const VENDOR_LABELS: Record<IconVendor, string> = {
  azure: "Azure",
  aws: "AWS",
  gcp: "Google Cloud",
  kubernetes: "Kubernetes",
  other: "",
};

/**
 * Words that name a thing other things go inside.
 *
 * Anchored to whole words in the dashed name, so `subnet` matches
 * `subnet` and `azure-subnets` but not `subnetwork-peering-status`. Kept
 * short and specific on purpose: a wrong "this is a container" is more
 * annoying than a missed one, because the shape is what you have to undo.
 */
const CONTAINERS = [
  /(^|-)vnets?($|-)/,
  /(^|-)virtual-networks?($|-)/,
  /(^|-)subnets?($|-)/,
  /(^|-)vpcs?($|-)/,
  /(^|-)resource-groups?($|-)/,
  /(^|-)subscriptions?($|-)/,
  /(^|-)management-groups?($|-)/,
  /(^|-)availability-zones?($|-)/,
  /(^|-)landing-zones?($|-)/,
  /(^|-)namespaces?($|-)/,
  /(^|-)clusters?($|-)/,
  /(^|-)regions?($|-)/,
  /(^|-)boundar(y|ies)($|-)/,
];

/** An icon reference without its collection: `custom:subnet` → `subnet`. */
export function plainName(ref: string): string {
  return ref.slice(ref.indexOf(":") + 1);
}

/**
 * Whether adding this icon should make a group rather than a single node.
 *
 * Takes the cleaned name — what `iconName` produced — because that is what
 * the icon is stored and referred to as.
 */
export function iconRole(name: string): "group" | "service" {
  return CONTAINERS.some((re) => re.test(name)) ? "group" : "service";
}

/**
 * Whose icon this is, from wherever it came from: a zip entry's path, a
 * URL, or a bare filename.
 *
 * The path is the good evidence — vendors ship
 * `Azure_Public_Service_Icons/Icons/networking/…`, and draw.io's library is
 * laid out as `azure2/networking/…`. A filename alone usually says nothing,
 * with one exception worth encoding: Microsoft numbers every file in its
 * pack `02068-icon-service-…`, which is as good as a signature.
 */
export function iconVendor(source: string): IconVendor {
  const path = source.toLowerCase();

  // Only the folders count, never the filename: a drawing somebody called
  // "my-aws-notes.svg" is not Amazon's, while `.../aws4/storage/S3.svg` is.
  const segments = path.split(/[/\\]/);
  const file = segments.pop() ?? "";
  const inDirs = (re: RegExp) => segments.some((s) => re.test(s));

  if (inDirs(/(^|[-_])azure/) || inDirs(/^microsoft/)) return "azure";
  if (inDirs(/(^|[-_])(aws\d*|amazon)/)) return "aws";
  if (inDirs(/(^|[-_])(gcp|google[-_]?cloud)/)) return "gcp";
  if (inDirs(/(^|[-_])(kubernetes|k8s)/)) return "kubernetes";

  // Microsoft's own filenames, which carry no folder when picked one by one
  // from a file dialog. The numbering is a signature; a word in a name is not.
  if (/^\d{4,}-icon-(service|)/.test(file)) return "azure";

  return "other";
}
