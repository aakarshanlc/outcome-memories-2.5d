export const KillerVariables = {
    'Tripwire': {
        speed: 1.3,
        size: 4,
        m1: {
            cooldown: 60,
            windup: 30,
            duration: 10,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1'
        },
        abilities: {
            grapple: {
                cooldown: 360,
                range: 60,
                projectileSpeed: 2.0,
                damage: 10,
                dragDuration: 30,
                dragSpeed: 0.5
            },
            bomb: {
                cooldown: 300,
                throwRange: 60,
                throwSpeed: 1.5,
                explodeRadius: 15,
                impactDamage: 20,
                aoeDamage: 10,
                proximityDamage: 15,
                proximityRadius: 10,
                lifetime: 900
            }
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    },
    '2011X': {
        speed: 1.4,
        size: 4,
        m1: {
            cooldown: 30,
            windup: 30,
            attackDuration: 12,
            hitCount: 6,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'killer_m1_2011x',
            applyBleed: true,
            bleedDuration: 180
        },
        abilities: {
            teleport: {
                cooldown: 720,
                windup: 120,
                arriveRadius: 15,
                bleedDuration: 120
            },
            gods_trickery: {
                cooldown: 960,
                duration: 60,
                hitboxCount: 5,
                hitboxSpacing: 5,
                hitboxWidth: 10,
                hitboxDepth: 10,
                invertDuration: 240
            }
        },
        rush: {
            stunThreshold: 5,
            duration: 540,
            speedMultiplier: 1.5
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    },
    'Starved': {
        speed: 1.2,
        size: 4,
        m1: {
            cooldown: 60,
            windup: 30,
            duration: 10,
            damage: 5,
            hitboxWidth: 20,
            hitboxDepth: 20,
            hitboxType: 'starved_m1'
        },
        projectile: {
            speed: 3.5,
            damage: 4,
            stunDuration: 12
        },
        ai: {
            attackRange: 14,
            visionRange: 9999
        }
    }
};