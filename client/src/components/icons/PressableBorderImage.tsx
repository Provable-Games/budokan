const PressableBorderImage = ({
  isPressed,
  variant = "default",
}: {
  isPressed: boolean;
  variant: "default" | "destructive" | "outline" | "tab" | null;
}) => {
  const getColor = () => {
    // For client-side rendering, try to get the actual CSS variable value
    if (typeof window !== "undefined" && document.documentElement) {
      try {
        const style = getComputedStyle(document.documentElement);
        const varName = `--border-${variant}`;
        const rgbValues = style.getPropertyValue(varName).trim();

        if (rgbValues) {
          // Convert "r, g, b" format to "rgb(r, g, b)"
          return `rgb(${rgbValues})`;
        }
      } catch (e) {
        console.error("Error getting computed style:", e);
      }
    }

    // Fallback
    return "rgb(0, 0, 0)";
  };

  const color = getColor();
  const path = isPressed
    ? "<path d='M2,2h2v2H2V2ZM4,0h2V2h-2V0Zm6,4h2v2h-2v-2ZM0,4H2v2H0v-2ZM6,0h2V2h-2V0Zm2,2h2v2h-2V2Zm0,6h2v2h-2v-2Zm-2,2h2v2h-2v-2ZM0,6H2v2H0v-2Zm10,0h2v2h-2v-2Zm-6,4h2v2h-2v-2Zm-2-2h2v2H2v-2Z'/>"
    : "<path d='M2,2h2v2H2V2ZM4,0h2V2h-2V0Zm6,4h2v2h-2v-2ZM0,4H2v2H0v-2ZM6,0h2V2h-2V0Zm2,2h2v2h-2V2Zm0,6h2v2h-2v-2Zm-2,2h2v2h-2v-2ZM0,6H2v2H0v-2Zm10,0h2v2h-2v-2Zm-6,4h2v2h-2v-2Zm-2-2h2v2H2v-2Zm6-2h2v2h-2v-2Zm-2,2h2v2h-2v-2Zm2-4h2v2h-2v-2Zm-4,4h2v2h-2v-2Zm2-2h2v2h-2v-2Z'/>";

  return `<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='${encodeURIComponent(
    color
  )}' >${path}</svg>`;
};

export default PressableBorderImage;
