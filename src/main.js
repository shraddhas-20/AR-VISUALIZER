import './style.css';
import { AudioEngine } from './audio.js';
import { EffectsEngine } from './effects.js';
import { GestureRecognizer, getDist } from './gestures.js';

// DOM Elements
const videoElement = document.querySelector('.input_video');
const bgCanvas = document.getElementById('bgCanvas');
const mainCanvas = document.getElementById('mainCanvas');
const bgCtx = bgCanvas.getContext('2d');
const ctx = mainCanvas.getContext('2d');

const uiHands = document.getElementById('ui-hands');
const uiFps = document.getElementById('ui-fps');
const uiGesture = document.getElementById('ui-gesture');
const uiSpread = document.getElementById('ui-spread');

const startOverlay = document.getElementById('startOverlay');
const startBtn = document.getElementById('startBtn');
const hudElement = document.getElementById('hud');
const themesElement = document.getElementById('themes');

const settingsToggle = document.getElementById('settingsToggle');
const settingsDrawer = document.getElementById('settingsDrawer');
const closeDrawer = document.getElementById('closeDrawer');

// Control Inputs & Value Displays
const cameraSelect = document.getElementById('cameraSelect');
const bgModeSelect = document.getElementById('bgModeSelect');

const volumeSlider = document.getElementById('volumeSlider');
const volVal = document.getElementById('volVal');

const particleSlider = document.getElementById('particleSlider');
const partVal = document.getElementById('partVal');

const lightningSlider = document.getElementById('lightningSlider');
const lightVal = document.getElementById('lightVal');

const blurSlider = document.getElementById('blurSlider');
const blurVal = document.getElementById('blurVal');

// Constants
const FINGER_TIPS = [4, 8, 12, 16, 20];

// Application State
let width = window.innerWidth;
let height = window.innerHeight;
let time = 0;
let lastTime = performance.now();
let framesThisSecond = 0;
let lastFpsTime = performance.now();

let currentHands = []; // Holds latest frame multiHandLandmarks
let handVelocities = 0; // Scaled indicator of hand movement speed
let currentTheme = 'Rainbow';

// Config Variables (bound to UI sliders)
let activeCamera = 'user';
let bgMode = 'matrix';
let particleDensity = 0.6;
let lightningSensitivity = 180;
let trailIntensity = 0.3;

// MediaPipe Instances
let cameraInstance = null;
let handsInstance = null;

// Instantiate Modular Subsystems
const audio = new AudioEngine();
const effects = new EffectsEngine();
const gestures = new GestureRecognizer();

/**
 * Themes styling mapping
 */
const themeColors = {
    'Rainbow': (t, val, max) => `hsl(${(t * 90 + val * (360 / max)) % 360}, 100%, 60%)`,
    'Cyberpunk': (t, val, max) => (val % 2 === 0) ? '#ff003c' : '#00f0ff',
    'Lava': (t, val, max) => `hsl(${(8 + (val * 12)) % 40}, 100%, ${50 + Math.sin(t * 3) * 12}%)`,
    'Ocean': (t, val, max) => `hsl(${185 + (val * 15)}, 100%, 55%)`,
    'Galaxy': (t, val, max) => `hsl(${260 + Math.sin(t * 2 + val) * 45}, 100%, 65%)`
};

function getThemeColor(val, max) {
    return themeColors[currentTheme](time, val, max);
}

/**
 * Handle viewport resizing
 */
function handleResize() {
    width = window.innerWidth;
    height = window.innerHeight;
    
    bgCanvas.width = width;
    bgCanvas.height = height;
    mainCanvas.width = width;
    mainCanvas.height = height;
    
    effects.resize(width, height);
}
window.addEventListener('resize', handleResize);
handleResize();

/**
 * Coordinate mapping (Normalizes MediaPipe landmarks to canvas space)
 */
function mapToCanvas(point) {
    return {
        x: point.x * width,
        y: point.y * height
    };
}

/**
 * Interactive Controls Drawer Events
 */
settingsToggle.addEventListener('click', () => {
    settingsDrawer.classList.toggle('drawer-closed');
});

closeDrawer.addEventListener('click', () => {
    settingsDrawer.classList.add('drawer-closed');
});

// Settings Inputs Bindings
volumeSlider.addEventListener('input', (e) => {
    const vol = parseFloat(e.target.value) / 100;
    audio.setVolume(vol);
    volVal.innerText = `${e.target.value}%`;
});

particleSlider.addEventListener('input', (e) => {
    particleDensity = parseFloat(e.target.value) / 100;
    partVal.innerText = `${e.target.value}%`;
});

lightningSlider.addEventListener('input', (e) => {
    lightningSensitivity = parseInt(e.target.value, 10);
    lightVal.innerText = e.target.value;
});

blurSlider.addEventListener('input', (e) => {
    trailIntensity = parseFloat(e.target.value) / 100;
    blurVal.innerText = `${e.target.value}%`;
});

bgModeSelect.addEventListener('change', (e) => {
    bgMode = e.target.value;
});

cameraSelect.addEventListener('change', (e) => {
    activeCamera = e.target.value;
    if (cameraInstance) {
        initCamera(activeCamera);
    }
});

// UI Theme Buttons Switcher
document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        currentTheme = e.target.getAttribute('data-theme');
        // Set CSS theme accent variable matching current selected mode
        document.documentElement.style.setProperty('--accent', getThemeColor(1, 1));
        document.documentElement.style.setProperty('--accent-glow', getThemeColor(1, 1) + '59');
    });
});

/**
 * MediaPipe Camera Setup
 */
async function initCamera(facingModeValue) {
    if (cameraInstance) {
        try {
            await cameraInstance.stop();
        } catch (err) {
            console.warn("Error stopping active camera:", err);
        }
    }

    cameraInstance = new window.Camera(videoElement, {
        onFrame: async () => {
            if (handsInstance) {
                await handsInstance.send({ image: videoElement });
            }
        },
        width: 1280,
        height: 720,
        facingMode: facingModeValue
    });

    try {
        await cameraInstance.start();
    } catch (err) {
        console.error("Camera access failed:", err);
        alert("Unable to access webcam. Please verify camera permissions in your browser settings.");
    }
}

/**
 * MediaPipe Hands API Setup
 */
function initMediaPipe() {
    handsInstance = new window.Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    handsInstance.onResults((results) => {
        if (!audio.isInitialized) return;

        const activeHandsCount = results.multiHandLandmarks ? results.multiHandLandmarks.length : 0;
        uiHands.innerText = activeHandsCount;

        // Rudimentary velocity mapping (tracks distance difference on index finger of hand 0)
        if (currentHands.length > 0 && results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const oldIndexPt = currentHands[0][8];
            const newIndexPt = results.multiHandLandmarks[0][8];
            if (oldIndexPt && newIndexPt) {
                handVelocities = getDist(oldIndexPt, newIndexPt);
            }
        } else {
            handVelocities = 0;
        }

        currentHands = results.multiHandLandmarks || [];
        
        // Modulate continuous audio synthesizer hum
        audio.updateHum(currentHands);
    });
}

/**
 * Start Button triggers experience
 */
startBtn.addEventListener('click', async () => {
    // Hide overlay and show panels
    startOverlay.classList.add('hidden');
    hudElement.classList.remove('hidden');
    themesElement.classList.remove('hidden');
    
    // Initialize systems
    audio.init();
    audio.setVolume(parseFloat(volumeSlider.value) / 100);
    
    initMediaPipe();
    await initCamera(activeCamera);
    
    requestAnimationFrame(renderLoop);
});

/**
 * Main Canvas Render Loop
 */
function renderLoop(timestamp) {
    requestAnimationFrame(renderLoop);

    const dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    time += dt;

    // Track FPS
    framesThisSecond++;
    if (timestamp > lastFpsTime + 1000) {
        uiFps.innerText = framesThisSecond;
        framesThisSecond = 0;
        lastFpsTime = timestamp;
    }

    // 1. Draw Background Layer (Matrix, Starfield, or Transparent trail)
    effects.drawBackground(bgCtx, width, height, getThemeColor, time, handVelocities, bgMode, trailIntensity);

    // 2. Refresh and Draw Main Overlay Canvas
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.fillRect(0, 0, width, height);

    // Setup Additive glow layer blending
    ctx.globalCompositeOperation = 'screen';

    // 3. Render Particles & Shockwaves
    effects.updatePhysics(ctx);

    // 4. Draw Hand Overlays & Custom Interactive Skeleton
    if (currentHands.length > 0) {
        currentHands.forEach((hand, handIndex) => {
            const glowColor = getThemeColor(handIndex, 2);
            
            // Draw skeleton joints using MediaPipe drawer utility
            const connections = window.HAND_CONNECTIONS || [];
            if (window.drawConnectors) {
                window.drawConnectors(ctx, hand, connections, {
                    color: glowColor,
                    lineWidth: 2.5
                });
            }

            // Draw glowing fingertip joints
            ctx.shadowBlur = 15;
            ctx.shadowColor = glowColor;

            FINGER_TIPS.forEach((tipIndex, idx) => {
                const pt = mapToCanvas(hand[tipIndex]);
                const tipColor = getThemeColor(idx, FINGER_TIPS.length);

                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 4.5, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Constant spark emitters
                if (Math.random() > 0.5) {
                    effects.createParticles(pt, tipColor, particleDensity);
                }
            });
            ctx.shadowBlur = 0; // Reset canvas shadow context
        });

        // Cross-hand Interactions: Lightning links & Mandala graphics
        if (currentHands.length >= 2) {
            const h1 = currentHands[0];
            const h2 = currentHands[1];

            FINGER_TIPS.forEach((tipIndex, idx) => {
                const pt1 = mapToCanvas(h1[tipIndex]);
                const pt2 = mapToCanvas(h2[tipIndex]);
                const dist = getDist(pt1, pt2);
                const col = getThemeColor(idx, FINGER_TIPS.length);

                // Jagged electric spark linkage on index range
                if (dist < lightningSensitivity && Math.random() > 0.45) {
                    ctx.beginPath();
                    ctx.moveTo(pt1.x, pt1.y);
                    
                    const steps = 4;
                    for (let step = 1; step < steps; step++) {
                        const ratio = step / steps;
                        const midX = pt1.x + (pt2.x - pt1.x) * ratio;
                        const midY = pt1.y + (pt2.y - pt1.y) * ratio;
                        // Add electric vibration jitter
                        const jitterX = (Math.random() - 0.5) * 30;
                        const jitterY = (Math.random() - 0.5) * 30;
                        ctx.lineTo(midX + jitterX, midY + jitterY);
                    }
                    ctx.lineTo(pt2.x, pt2.y);
                    ctx.strokeStyle = '#ffffff';
                    ctx.shadowBlur = 25;
                    ctx.shadowColor = col;
                    ctx.lineWidth = 2.5;
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                }

                // Smooth gradient connection line
                ctx.beginPath();
                ctx.moveTo(pt1.x, pt1.y);
                ctx.lineTo(pt2.x, pt2.y);

                const grad = ctx.createLinearGradient(pt1.x, pt1.y, pt2.x, pt2.y);
                grad.addColorStop(0, getThemeColor(idx, 5));
                grad.addColorStop(0.5, getThemeColor(idx + 1, 5));
                grad.addColorStop(1, getThemeColor(idx + 2, 5));

                ctx.strokeStyle = grad;
                ctx.lineWidth = 3.5;
                ctx.shadowBlur = 12;
                ctx.shadowColor = col;
                ctx.stroke();
                ctx.shadowBlur = 0;
            });

            // Cybernetic Mandala Geometry
            if (h1 && h2) {
                const allTips = FINGER_TIPS.map(t => mapToCanvas(h1[t]))
                    .concat(FINGER_TIPS.map(t => mapToCanvas(h2[t])));

                ctx.save();
                // Find mean coordinate
                const cx = allTips.reduce((sum, p) => sum + p.x, 0) / 10;
                const cy = allTips.reduce((sum, p) => sum + p.y, 0) / 10;

                ctx.translate(cx, cy);
                ctx.rotate(time * 0.45); // Rotate coordinates over time

                ctx.beginPath();
                for (let i = 0; i < 10; i++) {
                    const t1 = { x: allTips[i].x - cx, y: allTips[i].y - cy };
                    const t2 = { x: allTips[(i + 3) % 10].x - cx, y: allTips[(i + 3) % 10].y - cy };
                    ctx.moveTo(t1.x, t1.y);
                    ctx.lineTo(t2.x, t2.y);
                }
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
                ctx.lineWidth = 1.2;
                ctx.stroke();
                ctx.restore();
            }
        }

        // 5. Analyze Gesture telemetry and trigger sound/visual ripples
        const telemetry = gestures.detect(currentHands, (midpoint, handIdx) => {
            effects.createRipple(mapToCanvas(midpoint), getThemeColor(2, 5));
            audio.triggerZap();
        });

        // Update HUD Telemetry text
        uiGesture.innerText = telemetry.gestureName;
        uiSpread.innerText = `${telemetry.spreadPct}%`;
    }

    ctx.globalCompositeOperation = 'source-over'; // Restore default blending
}
