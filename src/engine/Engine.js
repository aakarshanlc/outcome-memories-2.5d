import * as THREE from 'three';

export class Engine {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0b0b0d);
        this.scene.fog = new THREE.Fog(0x0b0b0d, 40, 140);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 70, 50);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        // Cap the drawing buffer: on high-DPI screens the default pixel ratio makes
        // the GPU rasterize up to 4x the pixels for identical geometry. 1.25 keeps
        // edges clean while holding frame time steady (critical in split-screen).
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        // Moodier tonemapping: crushed highlights, deeper shadows.
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.92;
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

        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // views: [{ camera, rect }] in CSS pixels, top-left origin — renders each into its
    // scissored region of the one canvas. Without views, falls back to the full-page camera.
    render(views) {
        if (!views || views.length === 0) {
            this.renderer.shadowMap.autoUpdate = true;
            this.renderer.render(this.scene, this.camera);
            return;
        }

        const height = window.innerHeight;
        this.renderer.shadowMap.autoUpdate = false;
        this.renderer.shadowMap.needsUpdate = true;
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
