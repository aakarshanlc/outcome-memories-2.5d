// Import the music files directly so Vite can resolve their paths
import menuTrack from '../assets/music/menu1.mp3';
import tripwireTrack from '../assets/music/Tripwirechase.mp3';
import x2011Track from '../assets/music/2011Xchase.mp3';
import tailsLmsTrack from '../assets/music/Tailslms.mp3';
import knucklesLmsTrack from '../assets/music/Knuckleslms.mp3';
import defaultLmsTrack from '../assets/music/Eternal Hope, Eternal Fight.mp3';

// NEW: Automatically import ALL mp3 files from the sfx folder and its subfolders!
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

        // Parse the glob imports into a structured library: { Character: { action: [url1, url2] } }
        this.sfxLibrary = {};
        this.sfxCooldowns = {}; // Anti-spam tracker

        for (const path in sfxModules) {
            const url = sfxModules[path];
            // Example path: ../assets/sfx/Sonic/dash_1.mp3
            const cleanPath = path.replace('../assets/sfx/', '').replace('.mp3', '');
            const parts = cleanPath.split('/');
            
            if (parts.length === 2) {
                const charName = parts[0];
                let actionName = parts[1];
                
                // If file is named "dash_1", we just want the action name "dash"
                if (actionName.includes('_')) {
                    const actionParts = actionName.split('_');
                    // Check if the last part is a number
                    if (!isNaN(actionParts[actionParts.length - 1])) {
                        actionParts.pop(); // Remove the number
                        actionName = actionParts.join('_'); // Rejoin in case action had an underscore
                    }
                }

                if (!this.sfxLibrary[charName]) this.sfxLibrary[charName] = {};
                if (!this.sfxLibrary[charName][actionName]) this.sfxLibrary[charName][actionName] = [];
                this.sfxLibrary[charName][actionName].push(url);
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

    // NEW: Dynamic SFX Player with Random Selection & Anti-Spam
    playSfx(charName, actionName) {
        if (!charName || !actionName) return;

        // Anti-spam: Prevent the same sound from playing more than once every 100ms
        const cooldownKey = `${charName}_${actionName}`;
        const now = Date.now();
        if (this.sfxCooldowns[cooldownKey] && now - this.sfxCooldowns[cooldownKey] < 100) {
            return;
        }
        this.sfxCooldowns[cooldownKey] = now;

        const sounds = this.sfxLibrary[charName]?.[actionName];
        if (sounds && sounds.length > 0) {
            // Pick a random variation!
            const randomUrl = sounds[Math.floor(Math.random() * sounds.length)];
            const sfx = new Audio(randomUrl);
            sfx.volume = this.sfxVolume;
            sfx.play().catch(() => {});
        }
    }
}