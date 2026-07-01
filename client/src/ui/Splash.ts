/**
 * Splash / title screen. A self-contained, dependency-free overlay shown over
 * everything on first load: the pixel-art banner (docs/assets/banner.svg, copied
 * to client/public/banner.svg) plus a blinking retro "press anything" prompt,
 * on a dark CRT-vignette backdrop. Dismissed by any click / key / touch, fading
 * out to reveal the Lobby underneath.
 *
 * Deliberately standalone — it injects its OWN <style>, mounts itself on import,
 * and removes itself on dismiss. It does NOT couple to main.ts or the game loop,
 * so the lobby/canvas can render underneath while it is up; nothing depends on it.
 */

const SPLASH_ID = 'st-splash';
const STYLE_ID = 'st-splash-style';
/** Match the banner art's signature ember/gold so the splash reads as one piece. */
const FADE_MS = 420;

const CSS = `
#${SPLASH_ID} {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  /* Dusk vignette that picks up the banner's indigo->ember palette. */
  background:
    radial-gradient(120% 90% at 50% 38%, rgba(142,47,83,0.35) 0%, rgba(22,13,46,0.0) 60%),
    #0c0716;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  opacity: 1;
  transition: opacity ${FADE_MS}ms ease;
  overflow: hidden;
}
#${SPLASH_ID}.st-splash--out { opacity: 0; }

#${SPLASH_ID} .st-splash__art {
  width: min(860px, 92vw);
  height: auto;
  image-rendering: pixelated;          /* keep the 8/16-bit crispness when scaled */
  image-rendering: crisp-edges;
  filter: drop-shadow(0 0 24px rgba(255,122,31,0.35));
  animation: st-splash-pop 520ms cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
}

#${SPLASH_ID} .st-splash__prompt {
  font-family: 'Courier New', monospace;
  font-weight: bold;
  font-size: clamp(13px, 2.1vw, 18px);
  letter-spacing: 4px;
  color: #ffe9a8;
  text-shadow: 0 0 10px rgba(255,210,63,0.55);
  animation: st-splash-blink 1.05s steps(1, end) infinite;
}

#${SPLASH_ID} .st-splash__hint {
  font-family: 'Courier New', monospace;
  font-size: clamp(10px, 1.5vw, 12px);
  letter-spacing: 2px;
  color: #9a86b8;
}

/* CRT scanline veil over the whole splash, matching the banner's overlay. */
#${SPLASH_ID}::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    to bottom,
    rgba(0,0,0,0.10) 0px,
    rgba(0,0,0,0.10) 1px,
    rgba(0,0,0,0) 2px,
    rgba(0,0,0,0) 4px
  );
  mix-blend-mode: multiply;
}

@keyframes st-splash-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0.15; } }
@keyframes st-splash-pop {
  0%   { transform: scale(0.96) translateY(6px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  #${SPLASH_ID} .st-splash__art { animation: none; }
  #${SPLASH_ID} .st-splash__prompt { animation: none; }
}
`;

function injectStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

/**
 * Mount the splash overlay. Idempotent — a second call while one is showing is a
 * no-op. Resolves (returns) immediately; dismissal is handled by its own
 * listeners. Safe to call before or after the lobby has rendered.
 */
export function mountSplash(): void {
  if (document.getElementById(SPLASH_ID)) return;
  injectStyle();

  const overlay = document.createElement('div');
  overlay.id = SPLASH_ID;
  overlay.setAttribute('role', 'button');
  overlay.setAttribute('tabindex', '0');
  overlay.setAttribute('aria-label', 'singedTerra — press any key or click to start');

  const art = document.createElement('img');
  art.className = 'st-splash__art';
  // Resolve against the Vite base URL so the banner loads under a project-site path
  // (GitHub Pages /<repo>/) as well as at the domain root. BASE_URL always ends in '/'.
  art.src = `${import.meta.env.BASE_URL}banner.svg`;
  art.alt = 'singedTerra — a love letter to Scorched Earth (1991)';
  art.draggable = false;

  const prompt = document.createElement('div');
  prompt.className = 'st-splash__prompt';
  prompt.textContent = '▶  PRESS ANY KEY TO START';

  const hint = document.createElement('div');
  hint.className = 'st-splash__hint';
  hint.textContent = 'CLICK · TAP · SPACE';

  overlay.append(art, prompt, hint);
  document.body.appendChild(overlay);
  overlay.focus({ preventScroll: true });

  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    overlay.classList.add('st-splash--out');
    window.removeEventListener('keydown', dismiss);
    window.setTimeout(() => overlay.remove(), FADE_MS);
  };

  // Any meaningful interaction starts the game.
  overlay.addEventListener('click', dismiss, { once: true });
  overlay.addEventListener('touchstart', dismiss, { once: true, passive: true });
  window.addEventListener('keydown', dismiss);
}

// Auto-mount on import, once the DOM is ready, so wiring is a single import line.
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountSplash, { once: true });
  } else {
    mountSplash();
  }
}
