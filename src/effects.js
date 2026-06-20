/**
 * Effects Engine managing canvas particles, ripples, and dynamic background layers
 */
export class EffectsEngine {
    constructor() {
        this.particles = [];
        this.ripples = [];
        this.stars = [];
        this.matrixColumns = [];
        this.fontSize = 16;
        
        this.initStars(180);
    }

    /**
     * Initializes the 3D star positions
     */
    initStars(count) {
        this.stars = [];
        for (let i = 0; i < count; i++) {
            this.stars.push({
                x: (Math.random() - 0.5) * 1200,
                y: (Math.random() - 0.5) * 1200,
                z: Math.random() * 1000,
                size: Math.random() * 2.5 + 1
            });
        }
    }

    /**
     * Handles canvas dimension changes and recalculates background metrics
     */
    resize(width, height) {
        const columns = Math.floor(width / this.fontSize);
        this.matrixColumns = new Array(columns).fill(1).map(() => Math.random() * (height / this.fontSize));
    }

    /**
     * Spawns physics particles at a specific position
     * @param {Object} pos - The coordinates {x, y}
     * @param {string} color - The particle color string
     * @param {number} densityMultiplier - Normalized scale from UI slider [0, 1]
     */
    createParticles(pos, color, densityMultiplier = 0.6) {
        const count = Math.max(1, Math.round(6 * densityMultiplier));
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: pos.x,
                y: pos.y,
                vx: (Math.random() - 0.5) * 7,
                vy: (Math.random() - 0.5) * 7 - 2, // Slight upward bias
                life: 1.0,
                color: color,
                size: Math.random() * 3 + 1.5
            });
        }
    }

    /**
     * Triggers a shockwave ripple at a specific position
     */
    createRipple(pos, color) {
        this.ripples.push({
            x: pos.x,
            y: pos.y,
            radius: 0,
            maxRadius: 140 + Math.random() * 90,
            life: 1.0,
            color: color
        });
    }

    /**
     * Renders background visuals with a customizable fading motion trail
     */
    drawBackground(bgCtx, width, height, themeFn, time, handVelocities, mode, trailIntensity = 0.3) {
        // Clear background with trail fade
        bgCtx.globalCompositeOperation = 'destination-out';
        
        // Connect trailIntensity (0.05 to 0.8) to the fade alpha
        // A smaller alpha = longer trails. Value derived from UI slider
        const fadeAlpha = 0.05 + (1 - trailIntensity) * 0.45;
        bgCtx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha})`;
        bgCtx.fillRect(0, 0, width, height);
        bgCtx.globalCompositeOperation = 'source-over';

        if (mode === 'none') return;

        if (mode === 'matrix') {
            // Render Matrix Rain
            bgCtx.fillStyle = themeFn(time, 1, 1);
            bgCtx.font = `${this.fontSize}px monospace`;
            const speed = 1 + (handVelocities * 95);

            for (let i = 0; i < this.matrixColumns.length; i++) {
                if (Math.random() > 0.94) {
                    const char = String.fromCharCode(0x30A0 + Math.random() * 96);
                    bgCtx.fillText(char, i * this.fontSize, this.matrixColumns[i] * this.fontSize);
                }
                
                this.matrixColumns[i] += Math.random() * speed;
                
                if (this.matrixColumns[i] * this.fontSize > height && Math.random() > 0.9) {
                    this.matrixColumns[i] = 0;
                }
            }
        } else if (mode === 'starfield') {
            // Render 3D Warp Starfield
            const speed = 2 + (handVelocities * 140);
            
            for (let star of this.stars) {
                star.z -= speed;
                
                // Reset star if it passes the camera viewport plane
                if (star.z <= 0) {
                    star.z = 1000;
                    star.x = (Math.random() - 0.5) * 1200;
                    star.y = (Math.random() - 0.5) * 1200;
                }

                // 3D Perspective Projection
                const px = (star.x / star.z) * width + width / 2;
                const py = (star.y / star.z) * height + height / 2;

                if (px >= 0 && px < width && py >= 0 && py < height) {
                    const depthPercent = 1 - (star.z / 1000);
                    const depthSize = depthPercent * star.size * 2.5;
                    
                    // Modulate star color based on depth & theme
                    const color = themeFn(time, star.z, 1000);
                    bgCtx.fillStyle = color;
                    bgCtx.globalAlpha = depthPercent;
                    
                    bgCtx.beginPath();
                    bgCtx.arc(px, py, depthSize, 0, Math.PI * 2);
                    bgCtx.fill();
                }
            }
            bgCtx.globalAlpha = 1.0;
        }
    }

    /**
     * Updates and draws particles and ripples on the active canvas
     */
    updatePhysics(ctx) {
        // 1. Draw particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12; // Apply gravity
            p.life -= 0.02; // Fade life
            
            if (p.life <= 0) {
                this.particles.splice(i, 1);
            } else {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = p.life;
                ctx.fill();
            }
        }
        
        // 2. Draw shockwaves/ripples
        for (let i = this.ripples.length - 1; i >= 0; i--) {
            const r = this.ripples[i];
            r.radius += (r.maxRadius - r.radius) * 0.12; // Outwards easing
            r.life -= 0.025; // Fade life
            
            if (r.life <= 0) {
                this.ripples.splice(i, 1);
            } else {
                ctx.beginPath();
                ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
                ctx.strokeStyle = r.color;
                ctx.lineWidth = 4.5 * r.life;
                ctx.globalAlpha = r.life;
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1.0; // Reset canvas transparency context
    }
}
