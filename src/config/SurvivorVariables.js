export const SurvivorVariables = {
    'Sonic': {
        speed: 1,
        maxHealth: 100,
        size: 3,
        abilities: {
            dash: { cooldown: 480, duration: 30, multiplier: 3.0, windup: 15, endlag: 12, endlagStrength: 0.5, sfx: 'dash' }
        }
    },
    'Tails': {
        speed: 0.9,
        maxHealth: 100,
        size: 3,
        abilities: {
            gun: { cooldown: 600, stunDuration: 60, projectileSpeed: 3.0, maxCharge: 120, endlag: 30, endlagStrength: 0.5, sfx: 'gun_fire' },
            fly: { cooldown: 540, maxCharges: 3, chargeCooldown: 30, boost: 1.5, duration: 30, multiplier: 1.5, sfx: 'fly' }
        }
    },
    'Knuckles': {
        speed: 0.9,
        maxHealth: 125,
        size: 3,
        abilities: {
            parry: { cooldown: 600, duration: 60, stunDuration: 90, speedBoostDuration: 120, endlag: 30, endlagStrength: 0.5, sfx: 'parry' },
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
    },
    'Cream': {
        speed: 0.95,
        maxHealth: 80,
        size: 3,
        abilities: {
            heal: {
                cooldown: 1440,
                hitPenalty: 300,
                dmgCancelThreshold: 5,
                healPerTick: 2,
                comboHealPerTick: 4,
                tickInterval: 30,
                baseDuration: 180,
                maxDuration: 420,
                qteBonus: 90,
                healRadius: 14,
                cheeseSpeed: 2.2,
                cheeseSize: 1.2,
                cheeseFollowOffset: 5,
                cheeseCatchupDist: 30,
                qteWindow: 60,
                qteGap: 60,
                qteZoneWidth: 0.3,
                maxQtes: 4,
                endlag: 150,
                endlagStrength: 0.5
            },
            dash: {
                cooldown: 480,
                duration: 45,
                knockback: 12,
                dmgReduction: 0.75,
                endlag: 15,
                endlagStrength: 0.2
            }
        }
    }
};
