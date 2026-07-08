"use client";

import { useId } from "react";

/**
 * Fluid "AI intelligence" orb — a glassy liquid sphere in the brand light-blue
 * (#4cc9f0). Soft colour fields drift on smooth CSS paths, melted by a blur; a
 * bright specular highlight + fresnel rim light give it a polished 3D glass read,
 * with a fine film grain for texture. Motion is CSS-transform based (GPU-smooth).
 * Single source — every usage across the app updates here.
 */

const BLOBS = [
  { g: "eLight", anim: "orb-a", dur: 6.5, delay: -1,  cx: 38, cy: 36, r: 38 },
  { g: "eCyan",  anim: "orb-b", dur: 8,   delay: -5,  cx: 66, cy: 46, r: 36 },
  { g: "ePrim",  anim: "orb-c", dur: 7,   delay: -3,  cx: 46, cy: 70, r: 36 },
  { g: "eWhite", anim: "orb-b", dur: 9,   delay: -8,  cx: 58, cy: 56, r: 22 },
  { g: "ePeri",  anim: "orb-a", dur: 8.5, delay: -6,  cx: 30, cy: 62, r: 24 },
  { g: "eCyan",  anim: "orb-c", dur: 9.5, delay: -2,  cx: 64, cy: 30, r: 22 },
];

export function AiOrb({
  size = 36,
  className = "",
  animated = true,
  interactive = true,
}: {
  size?: number;
  className?: string;
  animated?: boolean;
  interactive?: boolean;
}) {
  const id = useId().replace(/[:]/g, "");
  const liquid = `liquid-${id}`;
  const grain = `grain-${id}`;
  const softMask = `soft-${id}`;

  return (
    <span
      className={`${interactive ? "ai-orb" : ""} relative inline-grid shrink-0 place-items-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
        <defs>
          <radialGradient id={`base-${id}`} cx="42%" cy="38%" r="72%">
            <stop offset="0%" stopColor="#cbf4ff" />
            <stop offset="36%" stopColor="#4cc9f0" />
            <stop offset="72%" stopColor="#33a2e8" />
            <stop offset="100%" stopColor="#2b6fcf" />
          </radialGradient>
          {/* directional depth for 3D volume (lower-right) */}
          <radialGradient id={`depth-${id}`} cx="66%" cy="72%" r="72%">
            <stop offset="0%" stopColor="#0a2352" stopOpacity="0" />
            <stop offset="66%" stopColor="#0a2352" stopOpacity="0" />
            <stop offset="100%" stopColor="#0a1f4a" stopOpacity="0.3" />
          </radialGradient>
          {/* fresnel rim light — bright edge on the lit side (dialed back a touch) */}
          <radialGradient id={`rim-${id}`} cx="40%" cy="33%" r="62%">
            <stop offset="82%" stopColor="#eafcff" stopOpacity="0" />
            <stop offset="96%" stopColor="#eafcff" stopOpacity="0.38" />
            <stop offset="100%" stopColor="#eafcff" stopOpacity="0" />
          </radialGradient>
          {/* soft specular highlight (less glossy) */}
          <radialGradient id={`gloss-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.6" />
            <stop offset="48%" stopColor="#ffffff" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          <radialGradient id={`eLight-${id}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#d6f6ff" /><stop offset="74%" stopColor="#d6f6ff" stopOpacity="0" /></radialGradient>
          <radialGradient id={`eCyan-${id}`}  cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#4cc9f0" /><stop offset="74%" stopColor="#4cc9f0" stopOpacity="0" /></radialGradient>
          <radialGradient id={`ePrim-${id}`}  cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#2f9fe6" /><stop offset="74%" stopColor="#2f9fe6" stopOpacity="0" /></radialGradient>
          <radialGradient id={`eWhite-${id}`} cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#f6ffff" /><stop offset="62%" stopColor="#f6ffff" stopOpacity="0" /></radialGradient>
          <radialGradient id={`ePeri-${id}`}  cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor="#93b8ff" /><stop offset="74%" stopColor="#93b8ff" stopOpacity="0" /></radialGradient>

          <filter id={liquid} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="soft" />
            <feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="7" result="n" />
            <feDisplacementMap in="soft" in2="n" scale="11" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          <filter id={grain} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" result="n" />
            <feColorMatrix in="n" type="saturate" values="0" />
            <feComponentTransfer><feFuncA type="table" tableValues="1 1" /></feComponentTransfer>
          </filter>

          {/* feathered soft edge (no hard border) */}
          <radialGradient id={`mg-${id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="96%" stopColor="#fff" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <mask id={softMask}><rect width="100" height="100" fill={`url(#mg-${id})`} /></mask>
        </defs>

        <g mask={`url(#${softMask})`}>
          <circle cx="50" cy="50" r="50" fill={`url(#base-${id})`} />

          <g filter={`url(#${liquid})`} style={{ mixBlendMode: "screen", transformOrigin: "50px 50px", animation: animated ? "orb-drift 9s ease-in-out infinite" : "none" }}>
            {BLOBS.map((b, i) => (
              <circle key={i} cx={b.cx} cy={b.cy} r={b.r} fill={`url(#${b.g}-${id})`}
                style={{ transformBox: "fill-box", transformOrigin: "center",
                  animation: animated ? `${b.anim} ${b.dur}s ease-in-out ${b.delay}s infinite` : "none" }} />
            ))}
          </g>

          <circle cx="50" cy="50" r="50" fill={`url(#depth-${id})`} />
          {/* fresnel rim + glassy highlight */}
          <circle cx="50" cy="50" r="50" fill={`url(#rim-${id})`} style={{ mixBlendMode: "screen" }} />
          <ellipse cx="37" cy="26" rx="25" ry="13" fill={`url(#gloss-${id})`} style={{ mixBlendMode: "screen" }} />
          <ellipse cx="63" cy="66" rx="8" ry="4.5" fill="#ffffff" opacity="0.08" style={{ mixBlendMode: "screen" }} />

          <rect x="0" y="0" width="100" height="100" filter={`url(#${grain})`} style={{ mixBlendMode: "overlay" }} opacity="0.11" />
        </g>
      </svg>
    </span>
  );
}
