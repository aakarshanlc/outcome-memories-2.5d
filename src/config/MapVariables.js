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
            damage: 15,
            knockUp: 4
        },
        sfx: { jumpPad: 'jump_pad', blockSink: 'block_sink', slam: 'block_sink' }
    }
};
