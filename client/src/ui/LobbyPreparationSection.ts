export interface LobbyPreparationSectionOptions {
  id: string;
  title: string;
  description?: string;
  children: readonly HTMLElement[];
}

/**
 * Shared semantic frame for the two primary pre-game setup routes. Route
 * builders retain ownership of their stateful controls; this owns only their
 * named, accessible presentation boundary.
 */
export function buildLobbyPreparationSection(
  options: LobbyPreparationSectionOptions,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'lobby-preparation-section';
  section.dataset.preparationSection = options.id;
  section.setAttribute('aria-labelledby', `${options.id}-heading`);

  const heading = document.createElement('h3');
  heading.id = `${options.id}-heading`;
  heading.className = 'lobby-preparation-section__title';
  heading.textContent = options.title;
  section.append(heading);

  if (options.description) {
    const purpose = document.createElement('p');
    purpose.className = 'lobby-preparation-section__purpose';
    purpose.textContent = options.description;
    section.append(purpose);
  }

  const body = document.createElement('div');
  body.className = 'lobby-preparation-section__body';
  body.append(...options.children);
  section.append(body);
  return section;
}
