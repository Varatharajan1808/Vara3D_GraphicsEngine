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

    // Selected object tracking
    private selectedObjectUUID: string | null = null;
    private selectedObjectUUIDs: Set<string> = new Set();
    private collapsedNodes: Set<string> = new Set();

    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.initializePanels();
        this.populateTextureLibraries();
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
            if (!this.isDescendant(this.fileMenuBtn, e.target as Node)) {
                this.fileMenu.classList.remove('show');
            }
            if (!this.isDescendant(this.addMenuBtn, e.target as Node)) {
                this.addMenu.classList.remove('show');
            }
            if (this.viewMenuBtn && !this.isDescendant(this.viewMenuBtn, e.target as Node)) {
                this.viewMenu?.classList.remove('show');
            }
            if (this.helpMenuBtn && !this.isDescendant(this.helpMenuBtn, e.target as Node)) {
                this.helpMenu?.classList.remove('show');
            }
        });

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

                if (type && (geometry || light || camera)) {
                    const subtype = geometry || light || camera || '';
                    this.handleAddObject(type, subtype);
                }
            });
        });

        // File menu items
        document.getElementById('new-scene-btn')?.addEventListener('click', () => {
            console.log('New Scene clicked');
            // TODO: Implement new scene
        });

        document.getElementById('import-gltf-btn')?.addEventListener('click', () => {
            console.log('Import GLTF clicked');
            // TODO: Implement GLTF import
        });

        document.getElementById('export-gltf-btn')?.addEventListener('click', () => {
            console.log('Export GLTF clicked');
            // TODO: Implement GLTF export
        });

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

    private setupDropdown(button: HTMLElement, menu: HTMLElement): void {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            menu.classList.toggle('show');

            // Close other dropdowns
            document.querySelectorAll('.dropdown-menu').forEach((m) => {
                if (m !== menu) {
                    m.classList.remove('show');
                }
            });
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

    private initializePanels(): void {
        this.panels.forEach((panel) => {
            const header = panel.querySelector('.panel-header');
            header?.addEventListener('click', () => {
                panel.classList.toggle('collapsed');
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

        visibleToggle?.addEventListener('click', () => {
            visibleToggle.classList.toggle('active');
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
            return;
        }
        // Update selected UUID
        this.selectedObjectUUID = object.uuid;
        if (!this.selectedObjectUUIDs.has(object.uuid)) {
            this.selectedObjectUUIDs.add(object.uuid);
        }

        // Show/hide panels based on object type
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

    private updatePanelVisibility(objectType: string): void {
        const materialPanel = document.getElementById('material-properties-panel');
        const lightPanel = document.getElementById('light-properties-panel');
        const texturePanel = document.getElementById('texture-properties-panel');
        const cameraPanel = document.getElementById('camera-properties-panel');

        // Show/hide based on object type
        const isLight = objectType?.includes('Light') || objectType === 'PointLight' || objectType === 'SpotLight' || objectType === 'DirectionalLight';
        const isMesh = objectType === 'Mesh';
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

    public updateSceneGraph(sceneObjects: any[]): void {
        const sceneTree = document.getElementById('scene-tree');
        if (!sceneTree) return;

        sceneTree.innerHTML = '';

        // Add a drop zone for the whole tree to allow reparenting to root
        sceneTree.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });

        sceneTree.addEventListener('drop', (e) => {
            e.preventDefault();
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                const draggedUuid = dragEvent.dataTransfer.getData('text/plain');
                if (draggedUuid && this.onNodeReparentCallback) {
                    this.onNodeReparentCallback(draggedUuid, null);
                }
            }
        });

        sceneObjects.forEach((obj) => {
            const isGizmo = obj.isGizmoPart || (obj.type && obj.type.startsWith('Gizmo-'));
            if (!isGizmo) {
                this.createTreeItem(obj, sceneTree, 0);
            }
        });
    }

    private createTreeItem(obj: any, parentElement: HTMLElement, depth: number): void {
        const isGizmo = obj.isGizmoPart || (obj.type && obj.type.startsWith('Gizmo-'));
        if (isGizmo) return;

        const li = document.createElement('li');
        li.className = 'tree-item';
        li.dataset.uuid = obj.uuid;

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

        li.addEventListener('dragend', (e) => {
            li.classList.remove('dragging');
            document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        });

        li.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                dragEvent.dataTransfer.dropEffect = 'move';
            }
            li.classList.add('drag-over');
        });

        li.addEventListener('dragleave', (e) => {
            li.classList.remove('drag-over');
        });

        li.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            li.classList.remove('drag-over');

            const dragEvent = e as DragEvent;
            if (dragEvent.dataTransfer) {
                const draggedUuid = dragEvent.dataTransfer.getData('text/plain');
                if (draggedUuid && draggedUuid !== obj.uuid) {
                    if (this.onNodeReparentCallback) {
                        this.onNodeReparentCallback(draggedUuid, obj.uuid);
                    }
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
            const itemUuid = (item as HTMLElement).dataset.uuid;
            if (itemUuid && this.selectedObjectUUIDs.has(itemUuid)) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    public selectObject(uuid: string | null): void {
        this.selectedObjectUUID = uuid;
        this.selectedObjectUUIDs = uuid ? new Set([uuid]) : new Set();

        // Update visual selection in tree
        const allItems = document.querySelectorAll('.tree-item');
        allItems.forEach(item => {
            if (uuid && (item as HTMLElement).dataset.uuid === uuid) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
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
