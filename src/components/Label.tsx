import { Fragment } from "react";
import { labelLines } from "../model/label";

/** A Mermaid label drawn as text, with its line breaks honoured. */
export function Label({ text }: { text: string }) {
  const lines = labelLines(text);
  return (
    <>
      {lines.map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line}
        </Fragment>
      ))}
    </>
  );
}
