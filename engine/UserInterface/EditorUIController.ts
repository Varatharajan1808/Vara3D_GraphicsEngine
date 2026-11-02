/**
 * UIManager - Main controller for the 3D Engine Editor UI
 * Handles all UI interactions, events, and state management
 */

export class EditorUIController {
    // Dropdown menus
    private fileMenuBtn!: HTMLElement;
    private fileMenu!: HTMLElement;
    private onUndoCallback?: () => void;
    private onRedoCallback?: () => void;
    private addMenuBtn!: HTMLElement;
    private addMenu!: HTMLElement;
    private viewMenuBtn!: HTMLElement;
    private viewMenu!: HTMLElement;
    private helpMenuBtn!: HTMLElement;
    private helpMenu!: HTMLElement;

    // Toolbar buttons
    private translateTool!: HTMLElement;
    private rotateTool!: HTMLElement;
    private scaleTool!: HTMLElement;
    private currentTool: string = 'translate';

    // Panel elements
    private panels!: NodeListOf<Element>;

    // Callbacks
    private onAddObjectCallback?: (type: string, subtype: string) => void;
    private onToolChangeCallback?: (tool: string) => void;
    private onTransformChangeCallback?: (transform: any) => void;
    private onObjectSelectCallback?: (uuid: string) => void;
    private onTextureSelectCallback?: (type: 'texture' | 'normal', url: string) => void;
    private onGridChangeCallback?: (settings: { visible: boolean; size: number; spacing: number }) => void;
    private onNodeReparentCallback?: (childUuid: string, parentUuid: string | null) => void;
    private onNodeVisibilityCallback?: (uuid: string, visible: boolean) => void;
    private onNodeDeleteCallback?: (uuid: string) => void;
    private onThemeChangeCallback?: (theme: 'dark' | 'light') => void;

    // Selected object tracking
    private selectedObjectUUID: string | null = null;
    private selectedObjectUUIDs: Set<string> = new Set();
    private collapsedNodes: Set<string> = new Set();
    private sceneTreeDropBound = false;
    private sceneTreeKeyBound = false;

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializePanels();
        this.populateTextureLibraries();
        this.bindSceneGraphRootDrop();
        this.bindSceneGraphKeyboard();
    }

    private initializeElements(): void {
        // Dropdown menus
        this.fileMenuBtn = document.getElementById('file-menu-btn')!;
        this.fileMenu = document.getElementById('file-menu')!;
        this.addMenuBtn = document.getElementById('add-menu-btn')!;
        this.addMenu = document.getElementById('add-menu')!;
        this.viewMenuBtn = document.getElementById('view-menu-btn') || null as any;
        this.viewMenu = document.getElementById('view-menu') || null as any;
        this.helpMenuBtn = document.getElementById('help-menu-btn') || null as any;
        this.helpMenu = document.getElementById('help-menu') || null as any;

        // Toolbar buttons
        this.translateTool = document.getElementById('translate-tool')!;
        this.rotateTool = document.getElementById('rotate-tool')!;
        this.scaleTool = document.getElementById('scale-tool')!;

        // Panels
        this.panels = document.querySelectorAll('.panel');
    }

    private setupEventListeners(): void {
        // Dropdown menu toggles
        this.setupDropdown(this.fileMenuBtn, this.fileMenu);
        this.setupDropdown(this.addMenuBtn, this.addMenu);
        if (this.viewMenuBtn && this.viewMenu) {
            this.setupDropdown(this.viewMenuBtn, this.viewMenu);
        }
        if (this.helpMenuBtn && this.helpMenu) {
            this.setupDropdown(this.helpMenuBtn, this.helpMenu);
        }

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            const target = e.target as Node;
            this.closeMenuIfOutside(this.fileMenuBtn, this.fileMenu, target);
            this.closeMenuIfOutside(this.addMenuBtn, this.addMenu, target);
            if (this.viewMenuBtn && this.viewMenu) {
                this.closeMenuIfOutside(this.viewMenuBtn, this.viewMenu, target);
            }
            if (this.helpMenuBtn && this.helpMenu) {
                this.closeMenuIfOutside(this.helpMenuBtn, this.helpMenu, target);
            }
        });

        document.getElementById('shortcuts-help-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showShortcutsHelp();
        });

        this.setupInspectorToggle();
        this.setupThemeToggle();

        // Toolbar tool selection
        this.translateTool.addEventListener('click', () => this.setActiveTool('translate'));
        this.rotateTool.addEventListener('click', () => this.setActiveTool('rotate'));
        this.scaleTool.addEventListener('click', () => this.setActiveTool('scale'));

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.target instanceof HTMLInputElement) return; // Ignore if typing in input

            switch (e.key.toLowerCase()) {
                case 't':
                    this.setActiveTool('translate');
                    break;
                case 'r':
                    this.setActiveTool('rotate');
                    break;
                case 's':
                    this.setActiveTool('scale');
                    break;
            }
        });

        // Add menu items
        const addMenuItems = this.addMenu.querySelectorAll('.dropdown-item');
        addMenuItems.forEach((item) => {
            item.addEventListener('click', () => {
                const type = (item as HTMLElement).dataset.type;
                const geometry = (item as HTMLElement).dataset.geometry;
                const light = (item as HTMLElement).dataset.light;
                const camera = (item as HTMLElement).dataset.camera;

                if (type && (geometry || light || camera || type === 'group')) {
                    const subtype = geometry || light || camera || '';
                    this.handleAddObject(type, subtype);
                }
            });
        });

        // File menu (new/import/export) is wired in EditorApplication

        // Transform inputs
        this.setupTransformInputs();

        // Material sliders
        this.setupMaterialSliders();

        // Texture buttons
        this.setupTextureButtons();

        // Color picker
        this.setupColorPicker();

        // Grid inputs
        this.setupGridInputs();
    }

    private getMenuItems(menu: HTMLElement): HTMLElement[] {
        return Array.from(
            menu.querySelectorAll<HTMLElement>('.dropdown-item:not(.disabled):not([disabled])')
        );
    }

    private setMenuOpen(button: HTMLElement, menu: HTMLElement, open: boolean, focusFirst = true): void {
        menu.classList.toggle('show', open);
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!open) return;

        document.querySelectorAll('.dropdown-menu').forEach((m) => {
            if (m !== menu) {
                m.classList.remove('show');
            }
        });
        document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]').forEach((btn) => {
            if (btn !== button) {
                btn.setAttribute('aria-expanded', 'false');
            }
        });

        if (focusFirst) {
            const first = this.getMenuItems(menu)[0];
            first?.focus();
        }
    }

    private closeMenuIfOutside(button: HTMLElement, menu: HTMLElement, target: Node): void {
        if (this.isDescendant(button, target) || this.isDescendant(menu, target)) {
            return;
        }
        menu.classList.remove('show');
        button.setAttribute('aria-expanded', 'false');
    }

    private setupDropdown(button: HTMLElement, menu: HTMLElement): void {
        button.setAttribute('aria-haspopup', 'menu');
        button.setAttribute('aria-expanded', menu.classList.contains('show') ? 'true' : 'false');
        if (!menu.getAttribute('role')) {
            menu.setAttribute('role', 'menu');
        }

        this.getMenuItems(menu).forEach((item) => {
            item.setAttribute('role', 'menuitem');
            item.tabIndex = -1;
        });

        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = !menu.classList.contains('show');
            this.setMenuOpen(button, menu, willOpen, willOpen);
        });

        button.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.setMenuOpen(button, menu, true, true);
            }
        });

        menu.addEventListener('keydown', (e) => {
            const items = this.getMenuItems(menu);
            if (items.length === 0) return;

            const currentIndex = items.indexOf(document.activeElement as HTMLElement);

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                this.setMenuOpen(button, menu, false, false);
                button.focus();
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = items[(currentIndex + 1 + items.length) % items.length];
                next?.focus();
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                const prev = items[(currentIndex - 1 + items.length) % items.length];
                prev?.focus();
                return;
            }

            if (e.key === 'Home') {
                e.preventDefault();
                items[0]?.focus();
                return;
            }

            if (e.key === 'End') {
                e.preventDefault();
                items[items.length - 1]?.focus();
                return;
            }

            if (e.key === 'Tab') {
                this.setMenuOpen(button, menu, false, false);
            }
        });

        menu.addEventListener('click', (e) => {
            const item = (e.target as HTMLElement).closest('.dropdown-item');
            if (!item || item.classList.contains('disabled')) return;
            this.setMenuOpen(button, menu, false, false);
            button.focus();
        });
    }

    private isDescendant(parent: HTMLElement, child: Node): boolean {
        let node = child.parentNode;
        while (node != null) {
            if (node === parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    }

    private setActiveTool(tool: string): void {
        this.currentTool = tool;

        // Update button states
        [this.translateTool, this.rotateTool, this.scaleTool].forEach((btn) => {
            btn.classList.remove('active');
        });

        switch (tool) {
            case 'translate':
                this.translateTool.classList.add('active');
                break;
            case 'rotate':
                this.rotateTool.classList.add('active');
                break;
            case 'scale':
                this.scaleTool.classList.add('active');
                break;
        }

        if (this.onToolChangeCallback) {
            this.onToolChangeCallback(tool);
        }
    }

    public getTheme(): 'dark' | 'light' {
        const attr = document.documentElement.getAttribute('data-theme');
        return attr === 'light' ? 'light' : 'dark';
    }

    public onThemeChange(callback: (theme: 'dark' | 'light') => void): void {
        this.onThemeChangeCallback = callback;
    }

    private setupThemeToggle(): void {
        const btn = document.getElementById('theme-toggle-btn');
        if (!btn) return;

        const storageKey = 'vara3d.theme';

        const apply = (theme: 'light' | 'dark', notify: boolean = true) => {
            document.documentElement.setAttribute('data-theme', theme);
            const isLight = theme === 'light';
            btn.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
            btn.setAttribute('aria-label', btn.title);
            try {
                localStorage.setItem(storageKey, theme);
            } catch {
                /* ignore */
            }
            if (notify && this.onThemeChangeCallback) {
                this.onThemeChangeCallback(theme);
            }
        };

        let theme: 'light' | 'dark' = 'dark';
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved === 'light' || saved === 'dark') {
                theme = saved;
            }
        } catch {
            theme = this.getTheme();
        }
        apply(theme, false);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            apply(this.getTheme() === 'light' ? 'dark' : 'light', true);
        });

        if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
            const observer = new MutationObserver((mutations) => {
                for (const m of mutations) {
                    if (m.attributeName === 'data-theme') {
                        const current = this.getTheme();
                        const isLight = current === 'light';
                        btn.title = isLight ? 'Switch to dark theme' : 'Switch to light theme';
                        btn.setAttribute('aria-label', btn.title);
                        if (this.onThemeChangeCallback) {
                            this.onThemeChangeCallback(current);
                        }
                    }
                }
            });
            observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
        }
    }

    private setupInspectorToggle(): void {
        const app = document.getElementById('app-container');
        const btn = document.getElementById('inspector-toggle-btn');
        const backdrop = document.getElementById('inspector-backdrop');
        if (!app || !btn) return;

        const storageKey = 'vara3d.inspectorOpen';
        const mq = window.matchMedia('(max-width: 1100px)');

        const isOverlayMode = () => mq.matches;

        const apply = (open: boolean) => {
            app.classList.toggle('inspector-open', open);
            app.classList.toggle('inspector-collapsed', !open);
            btn.setAttribute('aria-pressed', open ? 'true' : 'false');
            btn.title = open ? 'Hide Inspector (I)' : 'Show Inspector (I)';
            if (backdrop) {
                backdrop.hidden = !(isOverlayMode() && open);
                backdrop.classList.toggle('is-visible', isOverlayMode() && open);
            }
            try {
                localStorage.setItem(storageKey, open ? '1' : '0');
            } catch {
                /* ignore */
            }
            // Let the WebGL canvas pick up the new layout size
            window.dispatchEvent(new Event('resize'));
        };

        let open = true;
        try {
            const saved = localStorage.getItem(storageKey);
            if (saved === '0' || saved === '1') {
                open = saved === '1';
            } else if (isOverlayMode()) {
                open = false;
            }
        } catch {
            open = !isOverlayMode();
        }

        apply(open);

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            open = !app.classList.contains('inspector-open');
            apply(open);
        });

        backdrop?.addEventListener('click', () => {
            open = false;
            apply(false);
        });

        document.addEventListener('keydown', (e) => {
            if (
                e.target instanceof HTMLInputElement ||
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement)?.isContentEditable
            ) {
                return;
            }
            if (e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                open = !app.classList.contains('inspector-open');
                apply(open);
                return;
            }
            if (e.key === 'Escape' && isOverlayMode() && app.classList.contains('inspector-open')) {
                open = false;
                apply(false);
            }
        });

        const onMq = () => {
            // Entering overlay mode: keep current preference but sync backdrop
            apply(app.classList.contains('inspector-open'));
        };
        if (typeof mq.addEventListener === 'function') {
            mq.addEventListener('change', onMq);
        } else {
            // Safari < 14
            (mq as any).addListener?.(onMq);
        }

        // Shortcuts help modal list mention
        // (I) is documented via button title
    }

    private initializePanels(): void {
        this.panels.forEach((panel) => {
            const header = panel.querySelector('.panel-header') as HTMLElement | null;
            if (!header) return;

            const title =
                (panel as HTMLElement).id ||
                header.querySelector('.panel-title')?.textContent?.trim() ||
                'panel';
            const storageKey = `vara3d.panelCollapsed.${title}`;

            try {
                if (localStorage.getItem(storageKey) === '1') {
                    panel.classList.add('collapsed');
                }
            } catch {
                /* private mode / blocked storage */
            }

            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            header.setAttribute(
                'aria-expanded',
                panel.classList.contains('collapsed') ? 'false' : 'true'
            );
            header.title = 'Click to expand / collapse';

            const toggle = () => {
                panel.classList.toggle('collapsed');
                const collapsed = panel.classList.contains('collapsed');
                header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
                try {
                    localStorage.setItem(storageKey, collapsed ? '1' : '0');
                } catch {
                    /* ignore */
                }
            };

            header.addEventListener('click', toggle);
            header.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });
        });
    }

    private setupTransformInputs(): void {
        const transformInputs = [
            'pos-x', 'pos-y', 'pos-z',
            'rot-x', 'rot-y', 'rot-z',
            'scale-x', 'scale-y', 'scale-z'
        ];

        transformInputs.forEach((id) => {
            const input = document.getElementById(id) as HTMLInputElement;
            if (input) {
                input.addEventListener('input', () => {
                    this.handleTransformChange();
                });
            }
        });
    }

    private handleTransformChange(): void {
        const transform = {
            position: {
                x: parseFloat((document.getElementById('pos-x') as HTMLInputElement).value),
                y: parseFloat((document.getElementById('pos-y') as HTMLInputElement).value),
                z: parseFloat((document.getElementById('pos-z') as HTMLInputElement).value),
            },
            rotation: {
                x: parseFloat((document.getElementById('rot-x') as HTMLInputElement).value),
                y: parseFloat((document.getElementById('rot-y') as HTMLInputElement).value),
                z: parseFloat((document.getElementById('rot-z') as HTMLInputElement).value),
            },
            scale: {
                x: parseFloat((document.getElementById('scale-x') as HTMLInputElement).value),
                y: parseFloat((document.getElementById('scale-y') as HTMLInputElement).value),
                z: parseFloat((document.getElementById('scale-z') as HTMLInputElement).value),
            },
        };

        if (this.onTransformChangeCallback) {
            this.onTransformChangeCallback(transform);
        }
    }

    private setupMaterialSliders(): void {
        const metallicSlider = document.getElementById('metallic-slider') as HTMLInputElement;
        const metallicValue = document.getElementById('metallic-value')!;

        const roughnessSlider = document.getElementById('roughness-slider') as HTMLInputElement;
        const roughnessValue = document.getElementById('roughness-value')!;

        const specularSlider = document.getElementById('specular-slider') as HTMLInputElement;
        const specularValue = document.getElementById('specular-value')!;

        const alphaSlider = document.getElementById('alpha-slider') as HTMLInputElement;
        const alphaValue = document.getElementById('alpha-value')!;

        const emissionIntensitySlider = document.getElementById('emission-intensity-slider') as HTMLInputElement;
        const emissionIntensityValue = document.getElementById('emission-intensity-value')!;

        if (metallicSlider) {
            metallicSlider.addEventListener('input', () => {
                metallicValue.textContent = parseFloat(metallicSlider.value).toFixed(2);
            });
        }

        if (roughnessSlider) {
            roughnessSlider.addEventListener('input', () => {
                roughnessValue.textContent = parseFloat(roughnessSlider.value).toFixed(2);
            });
        }

        if (specularSlider) {
            specularSlider.addEventListener('input', () => {
                specularValue.textContent = specularSlider.value;
            });
        }

        if (alphaSlider) {
            alphaSlider.addEventListener('input', () => {
                alphaValue.textContent = parseFloat(alphaSlider.value).toFixed(2);
            });
        }

        if (emissionIntensitySlider) {
            emissionIntensitySlider.addEventListener('input', () => {
                emissionIntensityValue.textContent = parseFloat(emissionIntensitySlider.value).toFixed(1);
            });
        }
    }

    private setupTextureButtons(): void {
        const loadTextureBtn = document.getElementById('load-texture-btn');
        const textureFileInput = document.getElementById('texture-file-input') as HTMLInputElement;

        const loadNormalBtn = document.getElementById('load-normal-btn');
        const normalFileInput = document.getElementById('normal-file-input') as HTMLInputElement;

        loadTextureBtn?.addEventListener('click', () => {
            textureFileInput.click();
        });

        loadNormalBtn?.addEventListener('click', () => {
            normalFileInput.click();
        });

        textureFileInput?.addEventListener('change', (e) => {
            // Handled in EditorApplication.ts
        });

        normalFileInput?.addEventListener('change', (e) => {
            // Handled in EditorApplication.ts
        });
    }

    private setupColorPicker(): void {
        // Base color picker
        const colorSwatch = document.getElementById('base-color-swatch');
        const colorInput = document.getElementById('base-color-input') as HTMLInputElement;

        colorInput?.addEventListener('input', () => {
            if (colorSwatch) {
                colorSwatch.style.backgroundColor = colorInput.value;
            }
        });

        // Emission color picker
        const emissionColorSwatch = document.getElementById('emission-color-swatch');
        const emissionColorInput = document.getElementById('emission-color-input') as HTMLInputElement;

        emissionColorInput?.addEventListener('input', () => {
            if (emissionColorSwatch) {
                emissionColorSwatch.style.backgroundColor = emissionColorInput.value;
            }
        });

        // Light color picker
        const lightColorSwatch = document.getElementById('light-color-swatch');
        const lightColorInput = document.getElementById('light-color-input') as HTMLInputElement;

        lightColorInput?.addEventListener('input', () => {
            if (lightColorSwatch) {
                lightColorSwatch.style.backgroundColor = lightColorInput.value;
            }
        });
    }

    private setupGridInputs(): void {
        const visibleToggle = document.getElementById('grid-visible-toggle');

        const handleGridChange = () => {
            const isVisible = visibleToggle?.classList.contains('active') || false;

            if (this.onGridChangeCallback) {
                this.onGridChangeCallback({
                    visible: isVisible,
                    size: 20,  // Default value
                    spacing: 3.0  // Default value
                });
            }
        };

        const syncGridAria = () => {
            if (!visibleToggle) return;
            const on = visibleToggle.classList.contains('active');
            visibleToggle.setAttribute('aria-checked', on ? 'true' : 'false');
        };
        syncGridAria();

        visibleToggle?.addEventListener('click', () => {
            visibleToggle.classList.toggle('active');
            syncGridAria();
            handleGridChange();
        });
    }

    private populateTextureLibraries(): void {
        const textureLibrary = document.getElementById('texture-library');
        const normalLibrary = document.getElementById('normal-library');

        const textures = [
            { name: 'None', url: '' },
            { name: 'Bricks', url: 'engine/Textures/brick_wall_02_diff_2k.jpg' },
            { name: 'Tiles', url: 'engine/Textures/clay_roof_tiles_02_diff_1k.png' }
        ];

        const normalMaps = [
            { name: 'None', url: '' },
            { name: 'Tiles Normal', url: 'engine/Textures/clay_roof_tiles_02_nor_gl_1k.png' },
            { name: 'Stone Normal', url: 'engine/Textures/normal_mapping_normal_map_resized_66d168742d720.png' }
        ];

        if (textureLibrary) {
            textures.forEach(tex => {
                const item = this.createTextureLibraryItem(tex.name, tex.url, 'texture');
                textureLibrary.appendChild(item);
            });
        }

        if (normalLibrary) {
            normalMaps.forEach(nor => {
                const item = this.createTextureLibraryItem(nor.name, nor.url, 'normal');
                normalLibrary.appendChild(item);
            });
        }
    }

    private createTextureLibraryItem(name: string, url: string, type: 'texture' | 'normal'): HTMLElement {
        const item = document.createElement('div');
        item.className = 'texture-item';
        if (url === '') item.classList.add('none-item');
        item.title = name;

        if (url !== '') {
            const img = document.createElement('img');
            img.src = url;
            img.alt = name;
            item.appendChild(img);
        } else {
            const icon = document.createElement('div');
            icon.className = 'none-icon';
            icon.innerHTML = '✕';
            item.appendChild(icon);
        }

        const label = document.createElement('div');
        label.className = 'texture-item-label';
        label.textContent = name;
        item.appendChild(label);

        item.addEventListener('click', () => {
            // Remove active class from all items in this library
            const parent = item.parentElement;
            parent?.querySelectorAll('.texture-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            if (this.onTextureSelectCallback) {
                this.onTextureSelectCallback(type, url);
            }
        });

        return item;
    }

    private handleAddObject(type: string, subtype: string): void {
        console.log(`Add ${type}: ${subtype}`);
        if (this.onAddObjectCallback) {
            this.onAddObjectCallback(type, subtype);
        }
    }

    // Public API
    public onAddObject(callback: (type: string, subtype: string) => void): void {
        this.onAddObjectCallback = callback;
    }

    public onToolChange(callback: (tool: string) => void): void {
        this.onToolChangeCallback = callback;
    }

    public onTransformChange(callback: (transform: any) => void): void {
        this.onTransformChangeCallback = callback;
    }

    public onObjectSelect(callback: (uuid: string) => void): void {
        this.onObjectSelectCallback = callback;
    }

    public onTextureSelect(callback: (type: 'texture' | 'normal', url: string) => void): void {
        this.onTextureSelectCallback = callback;
    }

    public onGridChange(callback: (settings: { visible: boolean; size: number; spacing: number }) => void): void {
        this.onGridChangeCallback = callback;
    }

    public onNodeVisibility(callback: (uuid: string, visible: boolean) => void): void {
        this.onNodeVisibilityCallback = callback;
    }

    public onNodeDelete(callback: (uuid: string) => void): void {
        this.onNodeDeleteCallback = callback;
    }

    public showConfirm(options: {
        title?: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
        isDanger?: boolean;
        onConfirm: () => void;
        onCancel?: () => void;
    }): void {
        const existingModal = document.getElementById('app-modal-overlay');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'modal-overlay';

        const title = options.title || (options.isDanger ? 'Confirm Delete' : 'Confirm Action');
        const confirmText = options.confirmText || 'Confirm';
        const cancelText = options.cancelText || 'Cancel';
        const isDanger = options.isDanger ?? false;

        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon ${isDanger ? 'danger' : 'info'}">
                            ${isDanger
                                ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
                                : `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`
                            }
                        </span>
                        <h3 class="modal-title">${options.title}</h3>
                    </div>
                    <button class="modal-close-btn" id="modal-close-btn" title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="modal-body">${options.message}</div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-cancel" id="modal-cancel-btn">${cancelText}</button>
                    <button class="modal-btn ${isDanger ? 'modal-btn-danger' : 'modal-btn-confirm'}" id="modal-confirm-btn">${confirmText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeyDown);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                close();
                options.onCancel?.();
            } else if (e.key === 'Enter') {
                close();
                options.onConfirm();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                close();
                options.onCancel?.();
            }
        });

        document.getElementById('modal-close-btn')?.addEventListener('click', () => {
            close();
            options.onCancel?.();
        });

        document.getElementById('modal-cancel-btn')?.addEventListener('click', () => {
            close();
            options.onCancel?.();
        });

        document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
            close();
            options.onConfirm();
        });

        document.getElementById('modal-confirm-btn')?.focus();
    }

    /**
     * Non-blocking status toast (bottom-right). Auto-dismisses.
     * Use for success / light info; keep showAlert for blocking errors.
     */
    public showToast(
        message: string,
        options?: { type?: "success" | "info" | "error"; durationMs?: number }
    ): void {
        const type = options?.type ?? "success";
        const durationMs = options?.durationMs ?? 2800;

        let host = document.getElementById("app-toast-host");
        if (!host) {
            host = document.createElement("div");
            host.id = "app-toast-host";
            host.className = "toast-host";
            host.setAttribute("aria-live", "polite");
            document.body.appendChild(host);
        }

        const toast = document.createElement("div");
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        host.appendChild(toast);

        requestAnimationFrame(() => toast.classList.add("show"));

        window.setTimeout(() => {
            toast.classList.remove("show");
            toast.classList.add("hide");
            window.setTimeout(() => toast.remove(), 220);
        }, durationMs);
    }

    public showShortcutsHelp(): void {
        const row = (label: string, keys: string) =>
            `<div class="shortcuts-help-row"><span>${label}</span><kbd>${keys}</kbd></div>`;

        const body = `
            <div class="shortcuts-help-list">
                <div class="shortcuts-help-group-title">General</div>
                ${row('Undo', 'Ctrl+Z')}
                ${row('Redo', 'Ctrl+Y / Ctrl+Shift+Z')}
                ${row('Copy', 'Ctrl+C')}
                ${row('Paste', 'Ctrl+V')}
                ${row('Duplicate', 'Ctrl+D')}
                ${row('Delete', 'Del / Backspace')}
                ${row('Deselect', 'Esc')}
                ${row('Toggle theme', 'Top-bar sun/moon')}
                <div class="shortcuts-help-group-title">Menus</div>
                ${row('Open File menu', 'Shift+F')}
                ${row('Open Add menu', 'Shift+A')}
                ${row('Menu navigate', '↑ / ↓ · Esc closes')}
                ${row('Scene graph', '↑ / ↓ · ← / → fold')}
                <div class="shortcuts-help-group-title">Tools</div>
                ${row('Translate', 'T')}
                ${row('Rotate', 'R')}
                ${row('Scale', 'S')}
                ${row('Object mode', 'O')}
                ${row('Edit mode', 'E')}
                ${row('Vertex / Edge / Face', '1 / 2 / 3')}
                <div class="shortcuts-help-group-title">Viewport</div>
                ${row('Focus selection', 'F')}
                ${row('Toggle inspector', 'I')}
                ${row('Orbit', 'LMB drag (empty)')}
                ${row('Pan', 'MMB / right-drag')}
                ${row('Zoom', 'Scroll')}
            </div>
        `;

        this.showAlert('Keyboard Shortcuts', body);
    }

    public showAlert(title: string, message?: string): void {
        const modalTitle = message !== undefined ? title : "Notice";
        const modalMessage = message !== undefined ? message : title;
        const existingModal = document.getElementById('app-modal-overlay');
        if (existingModal) existingModal.remove();

        const overlay = document.createElement('div');
        overlay.id = 'app-modal-overlay';
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-dialog">
                <div class="modal-header">
                    <div class="modal-title-wrap">
                        <span class="modal-icon info">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                        </span>
                        <h3 class="modal-title">${modalTitle}</h3>
                    </div>
                    <button class="modal-close-btn" id="modal-close-btn" title="Close">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
                <div class="modal-body">${modalMessage}</div>
                <div class="modal-footer">
                    <button class="modal-btn modal-btn-confirm" id="modal-confirm-btn">OK</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const close = () => {
            overlay.remove();
            document.removeEventListener('keydown', handleKeyDown);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
                close();
            }
        };

        document.addEventListener('keydown', handleKeyDown);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        document.getElementById('modal-close-btn')?.addEventListener('click', close);
        document.getElementById('modal-confirm-btn')?.addEventListener('click', close);
    }

    public onNodeReparent(callback: (childUuid: string, parentUuid: string | null) => void): void {
        this.onNodeReparentCallback = callback;
    }

    public updateObjectProperties(object: any): void {
        if (!object) {
            this.selectedObjectUUID = null;
            this.selectedObjectUUIDs.clear();
            this.setInspectorEmpty(true);
            return;
        }
        // Update selected UUID
        this.selectedObjectUUID = object.uuid;
        if (!this.selectedObjectUUIDs.has(object.uuid)) {
            this.selectedObjectUUIDs.add(object.uuid);
        }

        // Show/hide panels based on object type
        this.setInspectorEmpty(false);
        this.updatePanelVisibility(object.type);

        // Update type and UUID
        const typeElement = document.getElementById('object-type');
        const uuidElement = document.getElementById('object-uuid');

        if (typeElement) typeElement.textContent = object.type || '-';
        if (uuidElement) uuidElement.textContent = object.uuid || '-';

        // Update transform values
        if (object.position) {
            (document.getElementById('pos-x') as HTMLInputElement).value = object.position.x || 0;
            (document.getElementById('pos-y') as HTMLInputElement).value = object.position.y || 0;
            (document.getElementById('pos-z') as HTMLInputElement).value = object.position.z || 0;
        }

        if (object.rotation) {
            (document.getElementById('rot-x') as HTMLInputElement).value = object.rotation.x || 0;
            (document.getElementById('rot-y') as HTMLInputElement).value = object.rotation.y || 0;
            (document.getElementById('rot-z') as HTMLInputElement).value = object.rotation.z || 0;
        }

        if (object.scale) {
            (document.getElementById('scale-x') as HTMLInputElement).value = object.scale.x || 1;
            (document.getElementById('scale-y') as HTMLInputElement).value = object.scale.y || 1;
            (document.getElementById('scale-z') as HTMLInputElement).value = object.scale.z || 1;
        }
    }

    /** Show empty-selection message; hide property panels when nothing is selected. */
    public setInspectorEmpty(isEmpty: boolean): void {
        const emptyState = document.getElementById('selection-empty-state');
        const objectPanel = document.getElementById('object-properties-panel');
        if (emptyState) emptyState.style.display = isEmpty ? 'block' : 'none';
        if (objectPanel) objectPanel.style.display = isEmpty ? 'none' : 'block';

        if (isEmpty) {
            const materialPanel = document.getElementById('material-properties-panel');
            const lightPanel = document.getElementById('light-properties-panel');
            const texturePanel = document.getElementById('texture-properties-panel');
            const cameraPanel = document.getElementById('camera-properties-panel');
            if (materialPanel) materialPanel.style.display = 'none';
            if (lightPanel) lightPanel.style.display = 'none';
            if (texturePanel) texturePanel.style.display = 'none';
            if (cameraPanel) cameraPanel.style.display = 'none';
        }
    }

    private updatePanelVisibility(objectType: string): void {
        const materialPanel = document.getElementById('material-properties-panel');
        const lightPanel = document.getElementById('light-properties-panel');
        const texturePanel = document.getElementById('texture-properties-panel');
        const cameraPanel = document.getElementById('camera-properties-panel');

        // Show/hide based on object type
        const isLight = objectType?.includes('Light') || objectType === 'PointLight' || objectType === 'SpotLight' || objectType === 'DirectionalLight';
        const isMesh = objectType === 'Mesh' || objectType?.includes('Geometry') || objectType === 'RenderableMeshObject';
        const isCamera = objectType === 'Camera';

        if (materialPanel) {
            materialPanel.style.display = isMesh ? 'block' : 'none';
        }
        if (lightPanel) {
            lightPanel.style.display = isLight ? 'block' : 'none';
        }
        if (texturePanel) {
            texturePanel.style.display = isMesh ? 'block' : 'none';
        }
        if (cameraPanel) {
            cameraPanel.style.display = isCamera ? 'block' : 'none';
        }
    }

    public updateStatusBar(stats: { fps: number; drawCalls: number; vertices: number; triangles: number }): void {
        const fpsElement = document.getElementById('fps-value');
        const drawCallsElement = document.getElementById('draw-calls-value');
        const verticesElement = document.getElementById('vertices-value');
        const trianglesElement = document.getElementById('triangles-value');

        if (fpsElement) fpsElement.textContent = Math.round(stats.fps).toString();
        if (drawCallsElement) drawCallsElement.textContent = stats.drawCalls.toString();
        if (verticesElement) verticesElement.textContent = stats.vertices.toLocaleString();
        if (trianglesElement) trianglesElement.textContent = stats.triangles.toLocaleString();
    }

    private getVisibleTreeItems(): HTMLElement[] {
        return Array.from(document.querySelectorAll<HTMLElement>('#scene-tree .tree-item')).filter(
            (el) => el.offsetParent !== null
        );
    }

    /**
     * True if `targetLi` is nested under the tree item with `ancestorUuid`
     * (i.e. dropping onto a descendant of the dragged node).
     */
    private isTreeUuidUnder(ancestorUuid: string, targetLi: HTMLElement): boolean {
        if (!ancestorUuid) return false;
        const ancestorLi = document.querySelector(
            `.tree-item[data-uuid="${ancestorUuid}"]`
        ) as HTMLElement | null;
        if (!ancestorLi || ancestorLi === targetLi) return false;
        const childList = ancestorLi.nextElementSibling as HTMLElement | null;
        return !!(childList?.classList.contains('tree-item-children') && childList.contains(targetLi));
    }

    private setTreeItemCollapsed(item: HTMLElement | undefined, collapsed: boolean): void {
        if (!item?.dataset.uuid) return;
        const uuid = item.dataset.uuid;
        const childrenContainer = item.nextElementSibling as HTMLElement | null;
        if (!childrenContainer?.classList.contains('tree-item-children')) return;

        if (collapsed) {
            this.collapsedNodes.add(uuid);
        } else {
            this.collapsedNodes.delete(uuid);
        }
        childrenContainer.style.display = collapsed ? 'none' : 'block';
        const toggle = item.querySelector('.tree-item-toggle') as HTMLElement | null;
        if (toggle && (toggle.textContent === '+' || toggle.textContent === '−')) {
            toggle.textContent = collapsed ? '+' : '−';
        }
    }

    private selectTreeItemFromKeyboard(item: HTMLElement | undefined): void {
        if (!item?.dataset.uuid) return;
        this.selectObject(item.dataset.uuid);
        item.scrollIntoView({ block: 'nearest' });
    }

    private bindSceneGraphKeyboard(): void {
        if (this.sceneTreeKeyBound) return;
        const sceneTree = document.getElementById('scene-tree');
        if (!sceneTree) return;
        this.sceneTreeKeyBound = true;

        sceneTree.setAttribute('role', 'tree');
        sceneTree.setAttribute('tabindex', '0');
        sceneTree.setAttribute('aria-label', 'Scene graph');

        sceneTree.addEventListener('keydown', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('.tree-action-btn') || target.closest('.tree-item-toggle')) {
                return;
            }

            const items = this.getVisibleTreeItems();
            if (items.length === 0) return;

            let idx = items.findIndex((el) => el.dataset.uuid === this.selectedObjectUUID);
            if (idx < 0) idx = 0;

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectTreeItemFromKeyboard(items[Math.min(idx + 1, items.length - 1)]);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectTreeItemFromKeyboard(items[Math.max(idx - 1, 0)]);
                    break;
                case 'Home':
                    e.preventDefault();
                    this.selectTreeItemFromKeyboard(items[0]);
                    break;
                case 'End':
                    e.preventDefault();
                    this.selectTreeItemFromKeyboard(items[items.length - 1]);
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.setTreeItemCollapsed(items[idx], false);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.setTreeItemCollapsed(items[idx], true);
                    break;
            }
        });
    }

    private bindSceneGraphRootDrop(): void {
        if (this.sceneTreeDropBound) return;
        const container = document.getElementById('scene-graph-container');
        const sceneTree = document.getElementById('scene-tree');
        if (!container || !sceneTree) return;
        this.sceneTreeDropBound = true;

        const clearRootTarget = () => container.classList.remove('root-drop-target');

        const onDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            container.classList.add('root-drop-target');
        };

        const onDragLeave = (e: DragEvent) => {
            const related = e.relatedTarget as Node | null;
            if (related && container.contains(related)) return;
            clearRootTarget();
        };

        const onDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            clearRootTarget();
            const draggedUuid = e.dataTransfer?.getData('text/plain');
            // Drop on empty area / tree chrome → reparent to root
            if (draggedUuid && this.onNodeReparentCallback) {
                const overItem = (e.target as HTMLElement | null)?.closest?.('.tree-item');
                if (!overItem) {
                    this.onNodeReparentCallback(draggedUuid, null);
                }
            }
        };

        container.addEventListener('dragover', onDragOver);
        container.addEventListener('dragleave', onDragLeave);
        container.addEventListener('drop', onDrop);
        document.addEventListener('dragend', clearRootTarget);
    }

    public updateSceneGraph(sceneObjects: any[]): void {
        const sceneTree = document.getElementById('scene-tree');
        const emptyState = document.getElementById('scene-graph-empty');
        if (!sceneTree) return;

        sceneTree.innerHTML = '';

        let contentCount = 0;
        sceneObjects.forEach((obj) => {
            const isGizmo = obj.isGizmoPart || (obj.type && obj.type.startsWith('Gizmo-'));
            if (!isGizmo) {
                this.createTreeItem(obj, sceneTree, 0);
                if (obj.type !== 'Camera') contentCount++;
            }
        });

        if (emptyState) {
            // Camera always exists — treat "empty" as no meshes/lights/groups yet
            const isEmpty = contentCount === 0;
            emptyState.style.display = isEmpty ? 'flex' : 'none';
            emptyState.setAttribute('aria-hidden', isEmpty ? 'false' : 'true');
        }
    }

    private createTreeItem(obj: any, parentElement: HTMLElement, depth: number): void {
        const isGizmo = obj.isGizmoPart || (obj.type && obj.type.startsWith('Gizmo-'));
        if (isGizmo) return;

        const li = document.createElement('li');
        li.className = 'tree-item';
        li.dataset.uuid = obj.uuid;
        li.setAttribute('role', 'treeitem');
        li.setAttribute(
            'aria-selected',
            this.selectedObjectUUIDs.has(obj.uuid) || obj.uuid === this.selectedObjectUUID
                ? 'true'
                : 'false'
        );

        // Container for better alignment
        const content = document.createElement('div');
        content.style.display = 'flex';
        content.style.alignItems = 'center';
        content.style.width = '100%';

        // Add indentation
        if (depth > 0) {
            content.style.paddingLeft = `${depth * 20}px`;
        }

        // Toggle icon for parents
        const hasChildren = obj.children && obj.children.length > 0;
        const toggle = document.createElement('span');
        toggle.className = 'tree-item-toggle';
        if (hasChildren) {
            const isCollapsed = this.collapsedNodes.has(obj.uuid);
            toggle.textContent = isCollapsed ? '+' : '−';
            toggle.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.collapsedNodes.has(obj.uuid)) {
                    this.collapsedNodes.delete(obj.uuid);
                } else {
                    this.collapsedNodes.add(obj.uuid);
                }
                // Refresh the whole graph or just this subtree? Prefer full refresh for simplicity
                // but usually we just toggle visibility of childrenContainer
                const childrenContainer = li.nextElementSibling as HTMLElement;
                if (childrenContainer && childrenContainer.classList.contains('tree-item-children')) {
                    const collapsed = this.collapsedNodes.has(obj.uuid);
                    childrenContainer.style.display = collapsed ? 'none' : 'block';
                    toggle.textContent = collapsed ? '+' : '−';
                }
            });
        }
        content.appendChild(toggle);

        // Highlight if selected (supports multi-selection)
        if (this.selectedObjectUUIDs.has(obj.uuid) || obj.uuid === this.selectedObjectUUID) {
            li.classList.add('selected');
        }

        const icon = document.createElement('span');
        icon.className = `tree-item-icon dot ${this.getObjectIconClass(obj.type)}`;

        const label = document.createElement('span');
        label.className = 'tree-item-label';
        label.textContent = obj.name || obj.type || 'Object';

        content.appendChild(icon);
        const isVisible = obj.visible !== false;
        if (!isVisible) {
            li.classList.add('hidden-node');
        }

        content.appendChild(label);

        // Action buttons (visibility & delete)
        const isCamera = obj.type === 'Camera';
        if (!isCamera) {
            const actions = document.createElement('div');
            actions.className = 'tree-item-actions';

            // Visibility toggle button
            const visBtn = document.createElement('button');
            visBtn.className = `tree-action-btn visibility-btn ${isVisible ? '' : 'hidden-state'}`;
            visBtn.title = isVisible ? 'Hide Object' : 'Show Object';
            visBtn.innerHTML = isVisible
                ? `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
                : `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;

            visBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (this.onNodeVisibilityCallback) {
                    this.onNodeVisibilityCallback(obj.uuid, !isVisible);
                }
            });

            // Delete button
            const delBtn = document.createElement('button');
            delBtn.className = 'tree-action-btn delete-btn';
            delBtn.title = 'Delete Object';
            delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`;

            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const nodeName = obj.name || obj.type || 'Object';
                this.showConfirm({
                    title: 'Delete Object',
                    message: `Are you sure you want to delete <strong style="color: var(--text-white);">"${nodeName}"</strong>? This action cannot be undone.`,
                    confirmText: 'Delete',
                    isDanger: true,
                    onConfirm: () => {
                        if (this.onNodeDeleteCallback) {
                            this.onNodeDeleteCallback(obj.uuid);
                        }
                    }
                });
            });

            actions.appendChild(visBtn);
            actions.appendChild(delBtn);
            content.appendChild(actions);
        }
        li.appendChild(content);

        // Add click handler for selection
        li.addEventListener('click', (e) => {
            e.stopPropagation();
            this.selectObject(obj.uuid);
            document.getElementById('scene-tree')?.focus({ preventScroll: true });
        });

        // Drag and Drop Logic
        li.draggable = true;

        li.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                dragEvent.dataTransfer.setData('text/plain', obj.uuid);
                dragEvent.dataTransfer.effectAllowed = 'move';
                li.classList.add('dragging');
            }
        });

        li.addEventListener('dragend', () => {
            li.classList.remove('dragging');
            document.querySelectorAll('.tree-item.drag-over').forEach((el) =>
                el.classList.remove('drag-over')
            );
            document.getElementById('scene-graph-container')?.classList.remove('root-drop-target');
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragEvent = e as DragEvent;
            const draggedUuid = dragEvent.dataTransfer?.getData('text/plain')
                || (document.querySelector('.tree-item.dragging') as HTMLElement | null)?.dataset.uuid
                || '';

            // Camera / self / own descendant are invalid drop targets
            const invalid =
                obj.type === 'Camera' ||
                (!!draggedUuid && draggedUuid === obj.uuid) ||
                this.isTreeUuidUnder(draggedUuid, li);

            if (dragEvent.dataTransfer) {
                dragEvent.dataTransfer.dropEffect = invalid ? 'none' : 'move';
            }
            document.querySelectorAll('.tree-item.drag-over').forEach((el) => {
                if (el !== li) el.classList.remove('drag-over');
            });
            li.classList.toggle('drag-over', !invalid);
            document.getElementById('scene-graph-container')?.classList.remove('root-drop-target');
        });

        li.addEventListener('dragleave', (e) => {
            const related = e.relatedTarget as Node | null;
            if (related && li.contains(related)) return;
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            li.classList.remove('drag-over');

            if (obj.type === 'Camera') return;

            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                const draggedUuid = dragEvent.dataTransfer.getData('text/plain');
                if (
                    draggedUuid &&
                    draggedUuid !== obj.uuid &&
                    !this.isTreeUuidUnder(draggedUuid, li) &&
                    this.onNodeReparentCallback
                ) {
                    this.onNodeReparentCallback(draggedUuid, obj.uuid);
                }
            }
        });

        parentElement.appendChild(li);

        // Add children if they exist
        if (obj.children && obj.children.length > 0) {
            const childrenContainer = document.createElement('ul');
            childrenContainer.className = 'tree-item-children';
            const isCollapsed = this.collapsedNodes.has(obj.uuid);
            childrenContainer.style.display = isCollapsed ? 'none' : 'block';

            obj.children.forEach((child: any) => {
                this.createTreeItem(child, childrenContainer, depth + 1);
            });
            parentElement.appendChild(childrenContainer);
        }
    }

    public selectObjects(uuids: string[]): void {
        this.selectedObjectUUIDs = new Set(uuids);
        this.selectedObjectUUID = uuids.length > 0 ? uuids[0] : null;

        const allItems = document.querySelectorAll('.tree-item');
        allItems.forEach(item => {
            const el = item as HTMLElement;
            const itemUuid = el.dataset.uuid;
            const selected = !!(itemUuid && this.selectedObjectUUIDs.has(itemUuid));
            el.classList.toggle('selected', selected);
            el.setAttribute('aria-selected', selected ? 'true' : 'false');
        });
    }

    public selectObject(uuid: string | null): void {
        this.selectedObjectUUID = uuid;
        this.selectedObjectUUIDs = uuid ? new Set([uuid]) : new Set();

        // Update visual selection in tree
        const allItems = document.querySelectorAll('.tree-item');
        allItems.forEach(item => {
            const el = item as HTMLElement;
            const selected = !!(uuid && el.dataset.uuid === uuid);
            el.classList.toggle('selected', selected);
            el.setAttribute('aria-selected', selected ? 'true' : 'false');
        });

        // Trigger callback
        if (uuid && this.onObjectSelectCallback) {
            this.onObjectSelectCallback(uuid);
        }
    }

    private getObjectIconClass(type: string): string {
        const typeStr = type.toLowerCase();
        if (typeStr.includes('mesh')) return 'dot-mesh';
        if (typeStr.includes('light')) return 'dot-light';
        if (typeStr.includes('camera')) return 'dot-camera';
        if (typeStr.includes('group') || typeStr === 'scenenode') return 'dot-group';
        return 'dot-default';
    }

    public setTool(tool: string): void {
        this.setActiveTool(tool);
    }

    public getCurrentTool(): string {
        return this.currentTool;
    }

    public onUndo(callback: () => void): void {
        this.onUndoCallback = callback;
    }

    public onRedo(callback: () => void): void {
        this.onRedoCallback = callback;
    }

    public updateUndoRedoUI(canUndo: boolean, canRedo: boolean, undoName?: string, redoName?: string): void {
        // Keyboard-only mode
    }
}
