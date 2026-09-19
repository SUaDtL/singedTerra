let preparationFrameId = 0;

type PreparationContent = Node | readonly Node[];

export interface PreparationPrimaryActionOptions {
  readonly label: string;
  readonly onActivate?: () => void;
  readonly disabled?: boolean;
  readonly busy?: boolean;
  readonly className?: string;
  readonly listenerSignal?: AbortSignal;
}

export interface PreparationPrimaryActionUpdate {
  readonly label: string;
  readonly disabled?: boolean;
  readonly busy?: boolean;
}

export interface PreparationFrameOptions {
  readonly root?: HTMLElement;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly titleId?: string;
  readonly description?: string;
  readonly descriptionId?: string;
  readonly headingContent?: Node;
  readonly headingAccessory?: Node;
  readonly body: PreparationContent;
  readonly dockLabel?: string;
  readonly dockStatus?: string | Node;
  readonly dockMessage?: Node;
  readonly primaryAction?: HTMLButtonElement | null;
  readonly secondaryActions?: PreparationContent | null;
  readonly className?: string;
  readonly headingClassName?: string;
  readonly titleClassName?: string;
  readonly descriptionClassName?: string;
  readonly bodyClassName?: string;
  readonly dockClassName?: string;
}

function appendContent(parent: HTMLElement, content: PreparationContent | null | undefined): void {
  if (!content) return;
  if (Array.isArray(content)) parent.append(...content);
  else parent.append(content as Node);
}

export function createPreparationPrimaryAction(
  document: Document,
  options: PreparationPrimaryActionOptions,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = [
    'command-center__action',
    'command-center__primary-action',
    'lobby-btn',
    'primary',
    'preparation-frame__primary-action',
    options.className,
  ].filter(Boolean).join(' ');
  button.dataset.preparationPrimary = '';
  updatePreparationPrimaryAction(button, options);
  if (options.onActivate) {
    button.addEventListener('click', options.onActivate, { signal: options.listenerSignal });
  }
  return button;
}

export function updatePreparationPrimaryAction(
  button: HTMLButtonElement,
  update: PreparationPrimaryActionUpdate,
): void {
  button.textContent = update.label;
  button.disabled = update.disabled ?? false;
  if (update.busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
}

function adoptPreparationPrimaryAction(button: HTMLButtonElement): void {
  button.classList.add(
    'command-center__action',
    'command-center__primary-action',
    'lobby-btn',
    'primary',
    'preparation-frame__primary-action',
  );
  button.dataset.preparationPrimary = '';
}

export function createPreparationFrame(
  document: Document,
  options: PreparationFrameOptions,
): HTMLElement {
  const id = ++preparationFrameId;
  const root = options.root ?? document.createElement('section');
  root.classList.add('preparation-frame');
  if (options.className) root.classList.add(...options.className.split(/\s+/).filter(Boolean));
  root.dataset.preparationFrame = '';

  const heading = document.createElement('header');
  heading.className = ['preparation-frame__heading', options.headingClassName]
    .filter(Boolean).join(' ');
  const headingCopy = document.createElement('div');
  headingCopy.className = 'preparation-frame__heading-copy';
  let title: HTMLElement;
  if (options.headingContent) {
    headingCopy.append(options.headingContent);
    title = headingCopy.querySelector<HTMLElement>('h1, h2, h3, h4, h5, h6')
      ?? document.createElement('h2');
    if (!title.isConnected && !headingCopy.contains(title)) headingCopy.prepend(title);
    if (!title.textContent) title.textContent = options.title ?? 'Preparation';
    title.classList.add('preparation-frame__title');
    if (options.titleClassName) title.classList.add(options.titleClassName);
    if (!title.id) title.id = options.titleId ?? `preparation-frame-title-${id}`;
  } else {
    if (options.eyebrow) {
      const eyebrow = document.createElement('p');
      eyebrow.className = 'preparation-frame__eyebrow';
      eyebrow.textContent = options.eyebrow;
      headingCopy.append(eyebrow);
    }
    title = document.createElement('h2');
    title.id = options.titleId ?? `preparation-frame-title-${id}`;
    title.className = ['preparation-frame__title', options.titleClassName].filter(Boolean).join(' ');
    title.textContent = options.title ?? 'Preparation';
    headingCopy.append(title);
  }
  let description: HTMLParagraphElement | null = null;
  if (options.description) {
    description = document.createElement('p');
    description.id = options.descriptionId ?? `preparation-frame-description-${id}`;
    description.className = ['preparation-frame__description', options.descriptionClassName]
      .filter(Boolean).join(' ');
    description.textContent = options.description;
    headingCopy.append(description);
  }
  heading.append(headingCopy);
  if (options.headingAccessory) heading.append(options.headingAccessory);

  const body = document.createElement('div');
  body.className = ['preparation-frame__body', options.bodyClassName].filter(Boolean).join(' ');
  body.dataset.preparationBody = '';
  body.setAttribute('aria-labelledby', title.id);
  if (description) body.setAttribute('aria-describedby', description.id);
  const bodyInner = document.createElement('div');
  bodyInner.className = 'preparation-frame__body-inner';
  appendContent(bodyInner, options.body);
  body.append(bodyInner);

  const dock = document.createElement('footer');
  dock.className = ['preparation-frame__dock', options.dockClassName].filter(Boolean).join(' ');
  dock.dataset.preparationDock = '';
  const dockCopy = document.createElement('div');
  dockCopy.className = 'preparation-frame__dock-copy';
  if (options.dockLabel) {
    const label = document.createElement('h3');
    label.className = 'preparation-frame__dock-label';
    label.textContent = options.dockLabel;
    dockCopy.append(label);
  }
  if (options.dockStatus) {
    const status = document.createElement('div');
    status.className = 'preparation-frame__dock-status';
    if (typeof options.dockStatus === 'string') status.textContent = options.dockStatus;
    else status.append(options.dockStatus);
    dockCopy.append(status);
  }
  if (options.dockMessage) dockCopy.append(options.dockMessage);

  const actions = document.createElement('div');
  actions.className = 'preparation-frame__dock-actions';
  appendContent(actions, options.secondaryActions);
  if (options.primaryAction) {
    adoptPreparationPrimaryAction(options.primaryAction);
    actions.append(options.primaryAction);
  }
  dock.append(dockCopy, actions);

  root.replaceChildren(heading, body, dock);
  return root;
}
