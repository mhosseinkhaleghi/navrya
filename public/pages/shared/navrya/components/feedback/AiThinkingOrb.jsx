import React from 'react';
import { useAiThinkingOrbMotion } from './AiThinkingOrb.motion.js';

// Two concentric rings (outer/inner), dot count + radius chosen to read clearly at the ~56-72px
// sizes this is actually used at (the reference Lottie's 5 dense layers were designed for a
// 1080px canvas - a literal dot-count port would be an illegible smear at UI scale). Positions are
// computed in real pixels (never CSS %, which would resolve against each dot's own box, not the
// orb's) so the ring geometry is correct regardless of `size`.
function polarPx(index, count, radius) {
  const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function OrbDot({ x, y, boxSize, durationMs, delayMs }) {
  return (
    <span style={{ position: 'absolute', top: '50%', left: '50%', width: boxSize, height: boxSize, transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}>
      <span data-nv-orb-dot style={{ animationDuration: durationMs + 'ms', animationDelay: delayMs + 'ms' }} />
    </span>
  );
}

/* The "AI is thinking" centerpiece - a breathing double ring of dots on var(--char-accent),
   staggered so a wave chases around each ring (the reference file's "concentric rings pulsing on
   a delay" character, adapted - see AiThinkingOrb.motion.js's own header comment for why this is a
   reimplementation, not a Lottie port). Purely decorative (aria-hidden) - the real, honest status
   text lives in whatever caller pairs this with (e.g. sessionAiAnalysisModal.jsx's
   AiThinkingFeed), never invented here. */
export function AiThinkingOrb({ size = 56, className }) {
  useAiThinkingOrbMotion();
  const outerCount = 10;
  const innerCount = 6;
  const outerRadius = size * 0.40;
  const innerRadius = size * 0.19;
  const outerDot = Math.max(3, size * 0.11);
  const innerDot = Math.max(3, size * 0.13);
  const outerDuration = 2000;
  const innerDuration = 1500;

  return (
    <span className={className} aria-hidden="true" style={{ position: 'relative', width: size, height: size, display: 'inline-block', flex: 'none' }}>
      {Array.from({ length: outerCount }).map((_, i) => {
        const { x, y } = polarPx(i, outerCount, outerRadius);
        return <OrbDot key={'o' + i} x={x} y={y} boxSize={outerDot} durationMs={outerDuration} delayMs={(i / outerCount) * outerDuration * 0.7} />;
      })}
      {Array.from({ length: innerCount }).map((_, i) => {
        const { x, y } = polarPx(i, innerCount, innerRadius);
        return <OrbDot key={'i' + i} x={x} y={y} boxSize={innerDot} durationMs={innerDuration} delayMs={(i / innerCount) * innerDuration * 0.7 + 250} />;
      })}
    </span>
  );
}
