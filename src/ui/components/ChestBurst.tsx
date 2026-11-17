// Chest burst — gold glints fanning out of the opened chest (CH1; docs/08
// §4.3 F8). Decorative only. The layout and cap live in chest-fx.ts; the
// motion is the `.chest-glint` CSS (hidden under reduced motion).

import { CHEST_BURST_LAYOUT } from "./chest-fx";

export function ChestBurst() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 [container-type:inline-size]"
    >
      {CHEST_BURST_LAYOUT.map((style, i) => (
        <span key={i} className="chest-glint chest-glint--burst" style={style} />
      ))}
    </div>
  );
}
