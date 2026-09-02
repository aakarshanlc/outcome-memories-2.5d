import menuTrack from '../assets/music/menu1.mp3';
import tripwireTrack from '../assets/music/Tripwirechase.mp3';
import x2011Track from '../assets/music/2011Xchase.mp3';
import tailsLmsTrack from '../assets/music/Tailslms.mp3';
import knucklesLmsTrack from '../assets/music/Knuckleslms.mp3';
import defaultLmsTrack from '../assets/music/Eternal Hope, Eternal Fight.mp3';

const sfxModules = import.meta.glob('../assets/sfx/**/*.mp3', { eager: true, query: '?url', import: 'default' });

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

        this.sfxLibrary = {};
        this.sfxCooldowns = {};
        this.sfxCache = {};
        this.sfxLastPick = {};

        for (const path in sfxModules) {
            const url = sfxModules[path];
            const cleanPath = path.replace('../assets/sfx/', '').replace('.mp3', '');
            const parts = cleanPath.split('/');

            if (parts.length === 2) {
                const charName = parts[0];
                let actionName = parts[1];

                if (actionName.includes('_')) {
                    const actionParts = actionName.split('_');
                    if (!isNaN(actionParts[actionParts.length - 1])) {
                        actionParts.pop();
                        actionName = actionParts.join('_');
                    }
                }

                if (!this.sfxLibrary[charName]) this.sfxLibrary[charName] = {};
                if (!this.sfxLibrary[charName][actionName]) this.sfxLibrary[charName][actionName] = [];
                this.sfxLibrary[charName][actionName].push(url);

                if (!this.sfxCache[url]) this.sfxCache[url] = new Audio(url);
            }
        }

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

    playSfx(charName, actionName) {
        if (!charName || !actionName) return;

        const cooldownKey = `${charName}_${actionName}`;
        const now = Date.now();
        if (this.sfxCooldowns[cooldownKey] && now - this.sfxCooldowns[cooldownKey] < 100) return;
        this.sfxCooldowns[cooldownKey] = now;

        const sounds = this.sfxLibrary[charName]?.[actionName];
        if (sounds && sounds.length > 0) {
            let url = sounds[0];
            if (sounds.length > 1) {
                do {
                    url = sounds[Math.floor(Math.random() * sounds.length)];
                } while (url === this.sfxLastPick[cooldownKey]);
                this.sfxLastPick[cooldownKey] = url;
            }
            const sfx = this.sfxCache[url].cloneNode();
            sfx.volume = this.sfxVolume;
            sfx.play().catch(() => {});
        }
    }
}
