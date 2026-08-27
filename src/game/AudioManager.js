// Import the music files directly so Vite can resolve their paths
import menuTrack from '../assets/music/menu1.mp3';
import tripwireTrack from '../assets/music/Tripwirechase.mp3';
import x2011Track from '../assets/music/2011Xchase.mp3';
import tailsLmsTrack from '../assets/music/Tailslms.mp3';
import knucklesLmsTrack from '../assets/music/Knuckleslms.mp3';
import defaultLmsTrack from '../assets/music/Eternal Hope, Eternal Fight.mp3';

// Import all SFX from src/assets/sfx/
import dashSfx from '../assets/sfx/dash.mp3';
import flySfx from '../assets/sfx/fly.mp3';
import gunFireSfx from '../assets/sfx/gun_fire.mp3';
import parrySfx from '../assets/sfx/parry.mp3';
import punchSfx from '../assets/sfx/punch.mp3';
import grappleSfx from '../assets/sfx/grapple.mp3';
import bombThrowSfx from '../assets/sfx/bomb_throw.mp3';
import teleportSfx from '../assets/sfx/teleport.mp3';
import trickerySfx from '../assets/sfx/trickery.mp3';
import killerM1Sfx from '../assets/sfx/killer_m1.mp3';
import killerM1HitSfx from '../assets/sfx/killer_m1_hit.mp3';
import jumpPadSfx from '../assets/sfx/jump_pad.mp3';
import blockSinkSfx from '../assets/sfx/block_sink.mp3';

export class AudioManager {
    constructor() {
        this.musicVolume = 0.5;
        this.sfxVolume = 0.8;
        this.currentTrack = null;
        this.audioElement = new Audio();
        this.audioElement.loop = true;
        this.hasInteracted = false; 
        
        this.tracks = {
            menu: menuTrack,
            Tripwire: tripwireTrack,
            '2011X': x2011Track,
            Tails_lms: tailsLmsTrack,
            Knuckles_lms: knucklesLmsTrack,
            default_lms: defaultLmsTrack
        };

        // SFX Mapping using imported variables
        this.sfxTracks = {
            'dash': dashSfx,
            'gun_fire': gunFireSfx,
            'fly': flySfx,
            'parry': parrySfx,
            'punch': punchSfx,
            'grapple': grappleSfx,
            'bomb_throw': bombThrowSfx,
            'teleport': teleportSfx,
            'trickery': trickerySfx,
            'killer_m1': killerM1Sfx,
            'killer_m1_hit': killerM1HitSfx,
            'jump_pad': jumpPadSfx,
            'block_sink': blockSinkSfx
        };

        this.load();
        this.applyVolume();
    }

    load() {
        const mVol = localStorage.getItem('om_music_vol');
        this.musicVolume = mVol !== null ? parseFloat(mVol) : 0.5;
        const sVol = localStorage.getItem('om_sfx_vol');
        this.sfxVolume = sVol !== null ? parseFloat(sVol) : 0.8;
    }

    save() {
        localStorage.setItem('om_music_vol', this.musicVolume);
        localStorage.setItem('om_sfx_vol', this.sfxVolume);
    }

    applyVolume() {
        this.audioElement.volume = this.musicVolume;
        const vid = document.getElementById('menu-video');
        if (vid) vid.volume = this.musicVolume;
    }

    playMusic(trackName) {
        const url = this.tracks[trackName];
        if (!url || this.currentTrack === trackName) return;
        
        this.audioElement.src = url;
        this.applyVolume();
        this.audioElement.play().catch(() => {}); 
        this.currentTrack = trackName;
    }

    stopMusic() {
        this.audioElement.pause();
        this.audioElement.currentTime = 0;
        this.currentTrack = null;
    }

    // Universal SFX Player
    playSfx(soundName) {
        if (!soundName) return;
        const url = this.sfxTracks[soundName];
        if (!url) return;

        // Create a new Audio object so sounds can overlap
        const sfx = new Audio(url);
        sfx.volume = this.sfxVolume;
        sfx.play().catch(() => {});
    }
}