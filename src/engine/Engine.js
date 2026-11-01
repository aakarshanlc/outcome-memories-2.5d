import * as THREE from 'three';

const GFX_KEY = 'om_gfx';

// Presets: LOW targets weaker machines (no shadow pass, smaller drawing
// buffer, no MSAA). HIGH matches the original shipped look.
export const GFX_PRESETS = {
    low:    { preset: 'low',    shadows: false, resolution: 0.6, antialias: false },
    medium: { preset: 'medium', shadows: true,  resolution: 0.8, antialias: false },
    high:   { preset: 'high',   shadows: true,  resolution: 1,   antialias: true }
};

// Resolution scale steps the settings screen cycles through.
export const GFX_RESOLUTION_STEPS = [0.6, 0.8, 1];

// Frames between shadow-map re-renders. The depth pass re-draws every caster
// into the light's map, and it was ~45% of frame time; with map geometry no
// longer casting, only characters move between frames and a 3-frame-old
// shadow is a couple of pixels of drift at 60fps.
const SHADOW_UPDATE_INTERVAL = 3;

const DEFAULT_GFX = { ...GFX_PRESETS.high };

function loadGfx() {
    try {
        const saved = JSON.parse(localStorage.getItem(GFX_KEY) || 'null');
        if (saved && typeof saved === 'object') {
            return {
                preset: typeof saved.preset === 'string' ? saved.preset : 'high',
                shadows: saved.shadows !== false,
                resolution: GFX_RESOLUTION_STEPS.includes(saved.resolution) ? saved.resolution : 1,
                antialias: saved.antialias !== false
            };
        }
    } catch (e) { /* corrupted entry: fall through to defaults */ }
    return { ...DEFAULT_GFX };
}

export class Engine {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0b0d);
        this.scene.fog = new THREE.Fog(0x0b0b0d, 40, 140);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 70, 50);
        this.camera.lookAt(0, 0, 0);

        // Graphics quality: persisted in localStorage, applied at boot so a
        // weak machine never pays for the high preset on its first frame.
        this.gfx = loadGfx();

        this.renderer = this.createRenderer();
        document.body.appendChild(this.renderer.domElement);

        const ambient = new THREE.AmbientLight(0xbfc4d0, 0.32);
        this.scene.add(ambient);

        const dirLight = new THREE.DirectionalLight(0xfff4ea, 0.7);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;

        dirLight.shadow.camera.left = -120;
        dirLight.shadow.camera.right = 120;
        dirLight.shadow.camera.top = 120;
        dirLight.shadow.camera.bottom = -120;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 300;

        dirLight.shadow.mapSize.width = 1024;
        dirLight.shadow.mapSize.height = 1024;
        dirLight.shadow.bias = -0.0005;

        this.scene.add(dirLight);
        this.scene.add(dirLight.target);
        this.dirLight = dirLight;

        window.addEventListener('resize', () => this.onResize());
    }

    createRenderer() {
        const renderer = new THREE.WebGLRenderer({
            antialias: this.gfx.antialias,
            powerPreference: 'high-performance'
        });
        // Cap the drawing buffer: on high-DPI screens the default pixel ratio
        // makes the GPU rasterize up to 4x the pixels for identical geometry,
        // then scale it by the user's resolution setting (LOW renders at 60%).
        renderer.setPixelRatio(this.pixelRatio());
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = this.gfx.shadows;
        renderer.shadowMap.type = THREE.PCFShadowMap;
        // Moodlier tonemapping: crushed highlights, deeper shadows.
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 0.92;
        return renderer;
    }

    pixelRatio() {
        // Cap the drawing buffer at one device pixel per CSS pixel: at 2x DPI
        // the browser rasterizes 4x the pixels for geometry this simple, and
        // this camera distance makes the extra sharpness invisible.
        return Math.min(window.devicePixelRatio || 1, 1) * this.gfx.resolution;
    }

    // Applies this.gfx to the live renderer and persists it. Resolution and
    // shadows are runtime-safe; antialias is a context flag, so the canvas is
    // rebuilt in place (the scene itself is untouched).
    applyGraphics() {
        const ctxAA = !!(this.renderer.getContext().getContextAttributes &&
            this.renderer.getContext().getContextAttributes().antialias);
        if (ctxAA !== this.gfx.antialias) this.recreateRenderer();

        const pr = this.pixelRatio();
        if (this.renderer.getPixelRatio() !== pr) {
            this.renderer.setPixelRatio(pr);
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        }

        if (this.renderer.shadowMap.enabled !== this.gfx.shadows) {
            this.renderer.shadowMap.enabled = this.gfx.shadows;
            this.flagAllMaterials();
            this.frame = -1;   // refresh the depth map on the next render
        }

        try {
            localStorage.setItem(GFX_KEY, JSON.stringify(this.gfx));
        } catch (e) { /* private mode: settings just won't persist */ }
    }

    // Shadow support is part of a program's cache key, so every material has
    // to recompile once when it flips.
    flagAllMaterials() {
        this.scene.traverse(o => {
            if (!o.isMesh) return;
            const m = o.material;
            if (Array.isArray(m)) m.forEach(x => { x.needsUpdate = true; });
            else if (m) m.needsUpdate = true;
        });
    }

    recreateRenderer() {
        const old = this.renderer;
        const next = this.createRenderer();
        old.domElement.replaceWith(next.domElement);
        this.renderer = next;
        this.frame = -1;   // brand-new shadow map: render it on the next frame
        // Free the old context (browsers cap how many a page may hold);
        // textures and buffers re-upload on the first frame of the new one.
        try { old.dispose(); old.forceContextLoss(); } catch (e) { /* already gone */ }
        this.flagAllMaterials();
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // views: [{ camera, rect }] in CSS pixels, top-left origin — renders each into its
    // scissored region of the one canvas. Without views, falls back to the full-page camera.
    render(views) {
        // Throttle the shadow pass: autoUpdate would re-render every caster
        // into the light's depth map on every frame (and once per frame the
        // map was still doing it in the single-camera path). needsUpdate is
        // cleared by three after it renders, so flipping it every Nth frame
        // is enough — the map texture stays valid in between.
        this.frame = (this.frame ?? -1) + 1;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = this.frame % SHADOW_UPDATE_INTERVAL === 0;

        if (!views || views.length === 0) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const height = window.innerHeight;
        this.renderer.setScissorTest(true);
        for (const view of views) {
            const { x, y, w, h } = view.rect;
            const glY = height - (y + h);
            this.renderer.setViewport(x, glY, w, h);
            this.renderer.setScissor(x, glY, w, h);
            this.renderer.render(this.scene, view.camera);
        }
        this.renderer.setScissorTest(false);
    }
}