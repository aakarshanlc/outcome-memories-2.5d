import * as THREE from 'three';
import { checkCircleBoxCollision } from '../engine/Collision.js';

// Blaze's Firewall (ability 1): a placed wall of flame.
// - Survivors pass through it freely and get a short speed boost inside its zone.
// - It is a physical obstacle for the killer only — he must path around it or
//   chew through its 30 HP with basic attacks (a 10-damage m1 takes 3 hits).
// - While inside the zone the killer is slowed (speedDebuff).
export class FireWall {
    // visualOnly: a network client renders the host's firewall without applying
    // any gameplay effects or touching the nav grid.
    constructor(gameManager, owner, x, z, visualOnly = false) {
        this.gameManager = gameManager;
        this.owner = owner;
        const cfg = owner.config.abilities.Firewall;

        this.cfg = cfg;
        this.visualOnly = visualOnly;
        this.w = cfg.hitboxWidth;
        this.d = cfg.hitboxDepth;
        this.zoneMargin = 3;
        this.health = cfg.health;
        this.maxHealth = cfg.health;
        this.timer = cfg.duration;
        this.destroyed = false;

        // Keep the whole footprint inside the arena (border walls sit at +/-100).
        this.x = Math.max(-95 + this.w / 2, Math.min(95 - this.w / 2, x));
        this.z = Math.max(-95 + this.d / 2, Math.min(95 - this.d / 2, z));

        // Same 10-tall / y=5 geometry as map walls so wallTopY collision math matches.
        const geo = new THREE.BoxGeometry(this.w, 10, this.d);
        const mat = new THREE.MeshBasicMaterial({
            color: 0xff5500,
            transparent: true,
            opacity: 0.5,
            depthWrite: false
        });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.set(this.x, 5, this.z);
        gameManager.engine.scene.add(this.mesh);

        // Obstacle record uses the same min-corner convention as MapManager walls.
        this.obstacle = {
            x: this.x - this.w / 2,
            z: this.z - this.d / 2,
            w: this.w,
            d: this.d,
            mesh: this.mesh,
            isFireWall: true
        };
    }

    update(players, killers) {
        this.timer--;

        if (!this.visualOnly) {
            const cfg = this.cfg;
            const m = this.zoneMargin;
            const zx = this.obstacle.x - m;
            const zz = this.obstacle.z - m;
            const zw = this.w + m * 2;
            const zd = this.d + m * 2;

            for (const k of killers) {
                if (checkCircleBoxCollision(k.mesh.position.x, k.mesh.position.z, k.size, zx, zz, zw, zd)) {
                    k.slowFrames = 2;
                    k.slowMult = cfg.speedDebuf;
                }
            }
            for (const p of players) {
                if (p.health <= 0 || p.escaped) continue;
                if (checkCircleBoxCollision(p.mesh.position.x, p.mesh.position.z, p.size, zx, zz, zw, zd)) {
                    p.fireBoostFrames = 2;
                    p.fireBoostMult = cfg.speedboost;
                }
            }
        }

        // Cheap flame flicker — toggles between two cached values, no allocation.
        this.mesh.material.opacity = 0.4 + ((this.timer >> 2) & 1) * 0.2;

        if (this.timer <= 0) this.destroy();
        return !this.destroyed;
    }

    takeDamage(amount) {
        if (this.destroyed || this.visualOnly) return;
        this.health -= amount;
        this.mesh.material.color.setHex(this.health > this.maxHealth / 2 ? 0xff5500 : 0xcc2200);
        if (this.health <= 0) this.destroy();
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.gameManager.engine.scene.remove(this.mesh);
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
        if (!this.visualOnly) this.gameManager.mapManager.navDirty = true;
    }
}
