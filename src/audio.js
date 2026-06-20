/**
 * Audio Engine utilizing the Web Audio API for real-time cybernetic sound synthesis.
 */
export class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.humOsc = null;
        this.humGain = null;
        this.masterGain = null;
        this.volume = 0.4; // 40% default volume
        this.isInitialized = false;
    }

    /**
     * Initializes the AudioContext and synth graph on user interaction
     */
    init() {
        if (this.isInitialized) return;
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContextClass();
            
            // Master gain node
            this.masterGain = this.audioCtx.createGain();
            this.masterGain.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
            this.masterGain.connect(this.audioCtx.destination);
            
            // Continuous interactive proximity hum oscillator
            this.humOsc = this.audioCtx.createOscillator();
            this.humGain = this.audioCtx.createGain();
            
            this.humOsc.type = 'sine';
            this.humOsc.frequency.setValueAtTime(100, this.audioCtx.currentTime);
            this.humGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // Start muted
            
            this.humOsc.connect(this.humGain);
            this.humGain.connect(this.masterGain);
            
            this.humOsc.start();
            this.isInitialized = true;
            console.log("Cyber Audio Engine initialized");
        } catch (e) {
            console.error("Failed to initialize Web Audio API", e);
        }
    }

    /**
     * Resume audio context if suspended
     */
    async resume() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }
    }

    /**
     * Updates master volume from UI slider
     * @param {number} value - Normalized volume between 0 and 1
     */
    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.masterGain && this.audioCtx) {
            this.masterGain.gain.setTargetAtTime(this.volume, this.audioCtx.currentTime, 0.05);
        }
    }

    /**
     * Triggers a synthetic electric zap sound (for pinch events)
     */
    triggerZap() {
        if (!this.isInitialized || !this.audioCtx) return;
        this.resume();

        const osc = this.audioCtx.createOscillator();
        const gainNode = this.audioCtx.createGain();
        
        // Zap profile: exponential decay in pitch and volume
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, this.audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(30, this.audioCtx.currentTime + 0.12);
        
        gainNode.gain.setValueAtTime(0.3, this.audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.12);
        
        osc.connect(gainNode);
        gainNode.connect(this.masterGain);
        
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.15);
    }

    /**
     * Modulates the active hum based on hand distance
     * @param {Array} activeHands - Hand landmarks from MediaPipe
     */
    updateHum(activeHands) {
        if (!this.isInitialized || !this.humGain || !this.audioCtx) return;
        this.resume();

        // Proximity hum requires both hands active
        if (activeHands.length < 2) {
            this.humGain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.15);
            return;
        }

        // Fetch index fingertip coordinates (landmark 8)
        const p1 = activeHands[0][8];
        const p2 = activeHands[1][8];
        
        if (!p1 || !p2) return;

        // Calculate distance in normalized space
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        // High proximity = hands close to each other
        const proximity = Math.max(0, 1 - dist); 
        
        // Pitch ramps from 90Hz (deep hum) to 420Hz (high frequency buzz)
        const targetFreq = 90 + (proximity * 330);
        // Volume grows louder the closer the hands are
        const targetVolume = 0.02 + (proximity * 0.18);
        
        this.humOsc.frequency.setTargetAtTime(targetFreq, this.audioCtx.currentTime, 0.08);
        this.humGain.gain.setTargetAtTime(targetVolume, this.audioCtx.currentTime, 0.08);
    }
}
