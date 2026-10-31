import * as THREE from 'three';

// Hitboxes are spawned constantly during attacks (2011X's m1 creates one every
// 2 ticks): geometries are keyed by size and shared instead of rebuilt each time.
const geoCache = new Map();
function getHitboxGeo(shape, radius, width, depth) {
    const key = shape === 'box'
        ? `b${Math.max(1, width)}x${Math.max(1, depth)}`
        : `s${Math.max(1, radius)}`;
    let geo = geoCache.get(key);
    if (!geo) {
        geo = shape === 'box'
            ? new THREE.BoxGeometry(Math.max(1, width), 10, Math.max(1, depth))
            : new THREE.SphereGeometry(Math.max(1, radius), 8, 8);
        geoCache.set(key, geo);
    }
    return geo;
}

// One shared wireframe material for every hitbox; opacity is per-mesh only if
// cloned, so each hitbox gets its own material instance from a shared prototype
// (cheap: materials are tiny, geometries are the expensive part).
function makeHitboxMat() {
    return new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true, transparent: true, opacity: 0.5 });
}

export class Hitbox {
    // visualOnly: spawned by a network client purely to render a host-authoritative
    // hitbox - collision logic never runs against it.
    constructor(gameManager, scene, x, z, radius, duration, owner, type, damage = 0, data = null, shape = 'sphere', width = 0, depth = 0, visualOnly = false) {
        this.scene = scene;
        this.x = x; this.z = z;
        this.radius = radius;
        this.width = width;
        this.depth = depth;
        this.duration = duration; this.maxDuration = duration;
        this.owner = owner; this.type = type; this.damage = damage; this.data = data;
        this.shape = shape;
        this.visualOnly = visualOnly;
        this.hasHit = new Set();

        const mat = makeHitboxMat();
        const geo = getHitboxGeo(shape, radius, width, depth);

        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(x, 5, z);
        this.mesh.visible = gameManager.settings.showHitboxes;
        scene.add(this.mesh);
    }

    update(gameManager) {
        this.duration--;
        this.mesh.material.opacity = (this.duration / this.maxDuration) * 0.5;
        this.mesh.visible = gameManager.settings.showHitboxes;

        if (this.duration <= 0) {
            this.scene.remove(this.mesh);
            this.mesh.material.dispose(); // geometry is shared/cached — don't dispose it
            return false;
        }
        return true;
    }
}
