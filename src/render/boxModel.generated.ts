/**
 * Generated from `src/styles.css` by `scripts/build-box-model.mjs`. Do not edit.
 *
 * These are the declarations `measureNode` and `renderSvg` need in order to
 * work out a node's box without a browser. Change the stylesheet and re-run the
 * script; CI runs it with `--check` and fails if the two have drifted.
 */
export const BOX_MODEL = {
  "fontFamily": "\"Segoe UI\", system-ui, sans-serif",
  "palette": {
    "dark": {
      "bg": "#0f1014",
      "text": "#ebebf0",
      "nodeFill": "#1c1f2b",
      "nodeStroke": "#7e8bdd",
      "edge": "#8b91a3",
      "edgeLabel": "#e6e9f0",
      "edgeLabelBg": "#20242f",
      "markerHollow": "#12141a"
    },
    "light": {
      "bg": "#f6f6f9",
      "text": "#161827",
      "nodeFill": "#ffffff",
      "nodeStroke": "#384abc",
      "edge": "#5f6673",
      "edgeLabel": "#1c2230",
      "edgeLabelBg": "#ffffff",
      "markerHollow": "#ffffff"
    }
  },
  "c4": {
    "fill": "#2b5797",
    "stroke": "#1f4177",
    "text": "#ffffff"
  },
  "borderWidth": 1.5,
  "shapeLabel": {
    "padX": 28,
    "padY": 8
  },
  "stateNode": {
    "padX": 36,
    "padY": 24,
    "minWidth": 120,
    "fontSize": 12.5
  },
  "tableNode": {
    "minWidth": 180,
    "fontSize": 12
  },
  "tableTitle": {
    "padX": 24,
    "padY": 14,
    "fontWeight": 600
  },
  "tableRows": {
    "padX": 0,
    "padY": 8
  },
  "tableRow": {
    "padX": 24,
    "padY": 4,
    "gap": 8
  },
  "erTypeColumn": {
    "minWidth": 48
  },
  "tableRowKeys": {
    "fontSize": 10
  },
  "tableRowMono": {
    "fontFamily": "\"Cascadia Code\", Consolas, monospace",
    "fontSize": 11.5
  },
  "classAnnotation": {
    "fontSize": 10
  },
  "participantHead": {
    "padX": 36,
    "padY": 24,
    "minWidth": 130
  },
  "serviceNode": {
    "padX": 24,
    "padY": 20,
    "minWidth": 90,
    "gap": 6
  },
  "serviceLabel": {
    "fontSize": 11.5,
    "maxWidth": 130
  },
  "c4Node": {
    "padX": 32,
    "padY": 24,
    "minWidth": 170,
    "maxWidth": 230
  },
  "c4Head": {
    "size": 26,
    "marginBottom": 4
  },
  "c4Tag": {
    "fontSize": 10
  },
  "c4Label": {
    "fontSize": 13,
    "fontWeight": 600
  },
  "c4Descr": {
    "fontSize": 11
  },
  "groupTitle": {
    "padX": 20,
    "padY": 12,
    "fontSize": 11
  },
  "noteNode": {
    "padX": 28,
    "padY": 22,
    "minWidth": 140,
    "maxWidth": 220,
    "fontSize": 12,
    "lineHeight": 1.45
  }
} as const;
