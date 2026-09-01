export const SurvivorVariables = {
    'Sonic': {
        speed: 1,
        maxHealth: 100,
        size: 3,
        abilities: {
            dash: { cooldown: 480, duration: 30, multiplier: 3.0, sfx: 'dash' }
        }
    },
    'Tails': {
        speed: 0.9,
        maxHealth: 100,
        size: 3,
        abilities: {
            gun: { cooldown: 600, stunDuration: 60, projectileSpeed: 3.0, maxCharge: 120, sfx: 'gun_fire' },
            fly: { cooldown: 540, maxCharges: 3, chargeCooldown: 30, boost: 1.5, duration: 30, multiplier: 1.5, sfx: 'fly' }
        }
    },
    'Knuckles': {
        speed: 0.9,
        maxHealth: 125,
        size: 3,
        abilities: {
            parry: { cooldown: 600, duration: 60, stunDuration: 90, speedBoostDuration: 120, sfx: 'parry' },
            punch: { cooldown: 1080, windupDuration: 30, activeDuration: 10, multiplier: 3.0, stunDuration: 75, knockback: 15, hitboxWidth: 15, hitboxDepth: 15, sfx: 'punch' }
        }
    },
    'Gaster': {
        speed: 2,
        maxHealth: 80,
        size: 3,
        abilities: {
            blink: { cooldown: 1, windup: 30, distance: 48 }
        }
    }
};