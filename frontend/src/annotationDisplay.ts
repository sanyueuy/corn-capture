export type AnnotationColorToken = {
  stroke: string;
  fill: string;
  softFill: string;
  accent: string;
  shadow: string;
};

const BOX_PALETTE: AnnotationColorToken[] = [
  {
    stroke: "#D9485F",
    fill: "rgba(217, 72, 95, 0.22)",
    softFill: "rgba(217, 72, 95, 0.12)",
    accent: "#FCECEF",
    shadow: "rgba(217, 72, 95, 0.24)",
  },
  {
    stroke: "#2979C9",
    fill: "rgba(41, 121, 201, 0.22)",
    softFill: "rgba(41, 121, 201, 0.12)",
    accent: "#E8F2FB",
    shadow: "rgba(41, 121, 201, 0.24)",
  },
  {
    stroke: "#2E9B62",
    fill: "rgba(46, 155, 98, 0.22)",
    softFill: "rgba(46, 155, 98, 0.12)",
    accent: "#E7F7EE",
    shadow: "rgba(46, 155, 98, 0.24)",
  },
  {
    stroke: "#8B5CF6",
    fill: "rgba(139, 92, 246, 0.22)",
    softFill: "rgba(139, 92, 246, 0.12)",
    accent: "#F0EAFE",
    shadow: "rgba(139, 92, 246, 0.24)",
  },
  {
    stroke: "#D97706",
    fill: "rgba(217, 119, 6, 0.24)",
    softFill: "rgba(217, 119, 6, 0.12)",
    accent: "#FDF0DF",
    shadow: "rgba(217, 119, 6, 0.24)",
  },
  {
    stroke: "#0F766E",
    fill: "rgba(15, 118, 110, 0.22)",
    softFill: "rgba(15, 118, 110, 0.12)",
    accent: "#E3F6F4",
    shadow: "rgba(15, 118, 110, 0.24)",
  },
];


export function getAnnotationColor(index: number): AnnotationColorToken {
  return BOX_PALETTE[index % BOX_PALETTE.length];
}
