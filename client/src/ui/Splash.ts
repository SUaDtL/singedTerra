/**
 * Splash / title screen. A self-contained, dependency-free overlay shown over
 * everything on first load: raster hero art plus exact HTML title text and a
 * blinking retro "press anything" prompt, on a dark CRT-vignette backdrop.
 * Dismissed by any click / key / touch, fading out to reveal the Lobby underneath.
 *
 * Deliberately standalone: it injects its own <style>, mounts itself on import,
 * and removes itself on dismiss. It does not couple to main.ts or the game loop,
 * so the lobby/canvas can render underneath while it is up; nothing depends on it.
 */

const SPLASH_ID = 'st-splash';
const STYLE_ID = 'st-splash-style';
/** Match the hero art's signature ember/gold so the splash reads as one piece. */
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
  background:
    radial-gradient(70% 45% at 50% 38%, rgba(255,122,31,0.18) 0%, rgba(255,122,31,0) 58%),
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

#${SPLASH_ID} .st-splash__frame {
  position: relative;
  width: min(960px, 92vw);
  aspect-ratio: 16 / 6;
  overflow: hidden;
  border: 3px solid rgba(9,4,13,0.96);
  outline: 2px solid rgba(255,210,63,0.62);
  outline-offset: -5px;
  background: #160d2e;
  filter:
    drop-shadow(0 18px 34px rgba(0,0,0,0.58))
    drop-shadow(0 0 28px rgba(255,122,31,0.42));
  animation: st-splash-pop 520ms cubic-bezier(0.2, 0.9, 0.25, 1.2) both;
}

#${SPLASH_ID} .st-splash__art {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

#${SPLASH_ID} .st-splash__title {
  position: absolute;
  left: 50%;
  top: 41%;
  transform: translate(-50%, -50%);
  font-family: Georgia, 'Times New Roman', serif;
  font-size: clamp(42px, 7vw, 76px);
  font-weight: 900;
  letter-spacing: 0.03em;
  line-height: 0.9;
  white-space: nowrap;
  -webkit-text-stroke: 2px rgba(26,8,14,0.96);
  text-shadow:
    0 4px 0 rgba(86,31,17,0.82),
    0 8px 18px rgba(0,0,0,0.72),
    0 0 22px rgba(255,122,31,0.45);
}

#${SPLASH_ID} .st-splash__title-a { color: #ffd23f; }
#${SPLASH_ID} .st-splash__title-b { color: #ff7a1f; }

#${SPLASH_ID} .st-splash__tagline {
  position: absolute;
  left: 50%;
  top: 56%;
  transform: translateX(-50%);
  padding: 4px 10px;
  background: rgba(12,7,22,0.62);
  border: 1px solid rgba(255,210,63,0.34);
  font-family: 'Courier New', monospace;
  font-size: clamp(10px, 1.7vw, 14px);
  font-weight: bold;
  letter-spacing: 0.2em;
  color: #ffe9a8;
  text-shadow: 0 2px 0 rgba(0,0,0,0.75);
  white-space: nowrap;
}

#${SPLASH_ID} .st-splash__prompt {
  padding: 10px 18px;
  border: 2px solid rgba(9,4,13,0.95);
  outline: 1px solid rgba(255,210,63,0.42);
  outline-offset: -4px;
  border-radius: 7px;
  background:
    linear-gradient(180deg, rgba(255,210,63,0.13), rgba(12,7,22,0.72)),
    rgba(12,7,22,0.78);
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
  text-transform: uppercase;
}

/* CRT scanline veil over the whole splash, matching the cel-shaded grain. */
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

@keyframes st-splash-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0.45; } }
@keyframes st-splash-pop {
  0%   { transform: scale(0.96) translateY(6px); opacity: 0; }
  100% { transform: scale(1) translateY(0); opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  #${SPLASH_ID} .st-splash__frame { animation: none; }
  #${SPLASH_ID} .st-splash__prompt { animation: none; }
}

@media (max-width: 560px) {
  #${SPLASH_ID} {
    gap: 18px;
  }

  #${SPLASH_ID} .st-splash__frame {
    width: min(94vw, 420px);
    aspect-ratio: 16 / 6.2;
  }

  #${SPLASH_ID} .st-splash__title {
    top: 43%;
    font-size: clamp(29px, 8.8vw, 38px);
    letter-spacing: 0.01em;
    -webkit-text-stroke: 1.2px rgba(26,8,14,0.96);
    text-shadow:
      0 3px 0 rgba(86,31,17,0.82),
      0 6px 14px rgba(0,0,0,0.72),
      0 0 18px rgba(255,122,31,0.45);
  }

  #${SPLASH_ID} .st-splash__tagline {
    top: 59%;
    padding: 3px 7px;
    font-size: clamp(7px, 2.15vw, 9px);
    letter-spacing: 0.12em;
  }

  #${SPLASH_ID} .st-splash__prompt {
    box-sizing: border-box;
    width: min(82vw, 360px);
    padding: 10px 12px;
    text-align: center;
    letter-spacing: 2.2px;
  }
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
 * Mount the splash overlay. Idempotent: a second call while one is showing is a
 * no-op. Resolves immediately; dismissal is handled by its own listeners.
 */
export function mountSplash(): void {
  if (document.getElementById(SPLASH_ID)) return;
  injectStyle();

  const overlay = document.createElement('div');
  overlay.id = SPLASH_ID;
  overlay.setAttribute('role', 'button');
  overlay.setAttribute('tabindex', '0');
  overlay.setAttribute('aria-label', 'singedTerra - press any key or click to start');

  const frame = document.createElement('div');
  frame.className = 'st-splash__frame';

  const art = document.createElement('img');
  art.className = 'st-splash__art';
  // Resolve against the Vite base URL so the hero loads under a project-site path
  // (GitHub Pages /<repo>/) as well as at the domain root. BASE_URL always ends in '/'.
  art.src = `${import.meta.env.BASE_URL}splash-hero.png`;
  art.alt = 'Cel-shaded artillery tanks dueling across a scorched dusk battlefield';
  art.draggable = false;

  const title = document.createElement('div');
  title.className = 'st-splash__title';
  title.innerHTML = '<span class="st-splash__title-a">singed</span><span class="st-splash__title-b">Terra</span>';

  const tagline = document.createElement('div');
  tagline.className = 'st-splash__tagline';
  tagline.textContent = 'A LOVE LETTER TO SCORCHED EARTH - 1991';

  const prompt = document.createElement('div');
  prompt.className = 'st-splash__prompt';
  prompt.textContent = '> PRESS ANY KEY TO START';

  const hint = document.createElement('div');
  hint.className = 'st-splash__hint';
  hint.textContent = 'CLICK - TAP - SPACE';

  frame.append(art, title, tagline);
  overlay.append(frame, prompt, hint);
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
