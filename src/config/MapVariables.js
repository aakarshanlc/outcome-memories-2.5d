export const MapVariables = {
    'Open Field': {
        jumpPadCount: 2,
        padBoost: 2.2,
        padCooldown: 60,
        sfx: { jumpPad: 'jump_pad', blockSink: 'block_sink' }
    },
    'Box Arena': {
        jumpPadCount: 4,
        padBoost: 2.2,
        padCooldown: 60,
        sfx: { jumpPad: 'jump_pad', blockSink: 'block_sink' }
    },
    'Maze Mania': {
        jumpPadCount: 4,
        padBoost: 2.2,
        padCooldown: 180,
        sfx: { jumpPad: 'jump_pad', blockSink: 'block_sink' }
    },
    // New map: a hall of rhythmic crushers. Each crusher sinks flush with the
    // floor (creating a walk-over shortcut) and rises again on a cycle - anyone
    // caught inside when it rises gets crushed and launched.
    'Crusher Hall': {
        jumpPadCount: 2,
        padBoost: 2.2,
        padCooldown: 60,
        crusher: {
            size: 14,
            period: 280,        // total cycle length in ticks (~4.7s)
            riseTicks: 20,
            raisedTicks: 90,
            warnTicks: 40,
            sinkTicks: 20,
            // sunkTicks is implied by the rest of the period
            damage: 15,
            knockUp: 2.6
        },
        sfx: { jumpPad: 'jump_pad', blockSink: 'block_sink', slam: 'block_sink' }
    }
};
