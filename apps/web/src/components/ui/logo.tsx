const GLYPHS: Record<string, string[]> = {
  R: ['1111.', '1...1', '1...1', '1111.', '1.1..', '1..1.', '1...1'],
  E: ['11111', '1....', '1....', '1111.', '1....', '1....', '11111'],
  L: ['1....', '1....', '1....', '1....', '1....', '1....', '11111'],
  A: ['.111.', '1...1', '1...1', '11111', '1...1', '1...1', '1...1'],
  Y: ['1...1', '1...1', '.1.1.', '..1..', '..1..', '..1..', '..1..'],
  D: ['1111.', '1...1', '1...1', '1...1', '1...1', '1...1', '1111.'],
  S: ['.1111', '1....', '1....', '.111.', '....1', '....1', '1111.'],
  K: ['1...1', '1..1.', '1.1..', '11...', '1.1..', '1..1.', '1...1'],
};

/** Pixel-font wordmark drawn as SVG rects (no external font needed). */
export function PixelWordmark({ text = 'RELAYDESK', cell = 2.6, className }: { text?: string; cell?: number; className?: string }) {
  const rects: { x: number; y: number }[] = [];
  let offset = 0;
  for (const ch of text) {
    const glyph = GLYPHS[ch];
    if (!glyph) continue;
    glyph.forEach((row, y) => [...row].forEach((c, x) => c === '1' && rects.push({ x: offset + x, y })));
    offset += 6;
  }
  return (
    <svg width={(offset - 1) * cell} height={7 * cell} viewBox={`0 0 ${offset - 1} 7`} shapeRendering="crispEdges" role="img" aria-label="RelayDesk" className={className} fill="currentColor">
      {rects.map((r) => (
        <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width="1" height="1" />
      ))}
    </svg>
  );
}

export const Wordmark = () => <PixelWordmark className="text-fg" />;
