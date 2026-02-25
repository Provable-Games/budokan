interface GameIconProps {
  image: string;
  size?: number;
  alt?: string;
}

const GameIcon = ({ image, size = 6, alt = "Game icon" }: GameIconProps) => {
  const pixelSize = size * 4;
  return image ? (
    <img
      src={image}
      alt={alt}
      loading="lazy"
      height={pixelSize}
      width={pixelSize}
      style={{ height: `${pixelSize}px`, width: "auto" }}
    />
  ) : null;
};

export default GameIcon;
