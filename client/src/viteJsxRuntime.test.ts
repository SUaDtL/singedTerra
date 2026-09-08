import { describe, expect, it } from 'vitest';
import config from '../vite.config';

describe('Vite 8 Preact JSX runtime', () => {
  it('pins the Oxc dev transform to Preact instead of its React default', () => {
    expect(config).toMatchObject({
      oxc: {
        jsx: {
          runtime: 'automatic',
          importSource: 'preact',
        },
      },
    });
  });
});
