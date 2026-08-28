import * as THREE from 'three';

export class Engine {
    constructor() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x1a1a1a);
        this.scene.fog = new THREE.Fog(0x1a1a1a, 50, 150);

        // 2.5D Camera: Angled top-down perspective
        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 70, 50); // High up, looking down
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        // Use PCFSoftShadowMap for smoother, nicer looking shadows
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
        document.body.appendChild(this.renderer.domElement);

        // Lighting
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);
        
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        
        // FIX: Configure the shadow camera to cover the entire 200x200 map!
        dirLight.shadow.camera.left = -120;
        dirLight.shadow.camera.right = 120;
        dirLight.shadow.camera.top = 120;
        dirLight.shadow.camera.bottom = -120;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 300;
        
        // Increase shadow map resolution for sharper shadows
        dirLight.shadow.mapSize.width = 2048;
        dirLight.shadow.mapSize.height = 2048;
        
        // Slight bias to prevent shadow acne (flickering artifacts)
        dirLight.shadow.bias = -0.0005;
        
        this.scene.add(dirLight);
        // Add the target so the light points correctly
        this.scene.add(dirLight.target);

        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}