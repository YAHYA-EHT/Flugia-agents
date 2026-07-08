import Image from "next/image";

/**
 * Presents Aria's full character standing in front of a soft circular backdrop
 * (the way flugia frames its agents). The figure is never cropped — object-contain
 * over a circle that sits behind her.
 */
export function AriaPortrait({ size = 176 }: { size?: number }) {
  return (
    <div
      className="relative flex items-end justify-center"
      style={{ width: size, height: size }}
    >
      <div className="absolute bottom-[6%] aspect-square w-[80%] rounded-full bg-gradient-to-b from-brand-strong/15 to-brand-accent/10" />
      <Image
        src="/Aria.webp"
        alt="Aria"
        width={size}
        height={size}
        priority
        className="relative z-10 object-contain drop-shadow-sm"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
