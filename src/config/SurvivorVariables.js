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
                cooldown: 1440,        // 24s ability cooldown
                hitPenalty: 300,       // +5s cooldown when Cheese is hit during a heal
                dmgCancelThreshold: 5, // cheese hit by an attack dealing more than this cancels the heal
                healPerTick: 2,        // hp per tick
                comboHealPerTick: 8,   // hp per tick after 2 QTEs in a row
                tickInterval: 30,      // 0.5s between heal ticks
                baseDuration: 180,     // 3s base heal duration
                maxDuration: 420,      // heal can never last longer than 7s
                qteBonus: 90,          // +1.5s of heal per successful QTE
                healRadius: 14,        // radius of the heal zone around Cheese
                cheeseSpeed: 2.2,      // Cheese movement speed per frame
                cheeseSize: 1.2,       // Cheese hitbox/visual radius
                cheeseFollowOffset: 5, // distance Cheese trails behind Cream
                cheeseCatchupDist: 30, // beyond this Cheese teleports back to Cream
                qteWindow: 60,         // frames the QTE marker takes to cross the bar
                qteGap: 60,            // frames between QTE prompts
                qteZoneWidth: 0.3,     // success zone size (fraction of the bar)
                maxQtes: 4,            // total QTE prompts allowed per heal
                endlag: 45,            // frames of slowdown from ability start
                endlagStrength: 0.5    // speed multiplier reduction while endlag lasts
            },
            dash: {
                cooldown: 480,         // same as Sonic's dash
                duration: 45,          // same duration as Sonic's dash
                knockback: 12,         // a little less than Knuckles' punch (15)
                dmgReduction: 0.75,    // 75% damage reduction while dashing
                endlag: 15,
                endlagStrength: 0.2    // speed multiplier reduction while endlag lasts
            }
        }
    }
};