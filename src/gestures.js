/**
 * Helper to calculate Euclidean distance between two points
 */
export function getDist(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

/**
 * Recognizer for evaluating active hand poses and dual-hand interactions
 */
export class GestureRecognizer {
    constructor() {
        // Track pinch state of up to two hands to avoid duplicate event triggers
        this.lastPinchState = [false, false];
        this.pinchThreshold = 0.055; // Proximity threshold for pinch detection
    }

    /**
     * Analyzes hands data and returns recognized telemetry
     * @param {Array} hands - MediaPipe hands multiHandLandmarks array
     * @param {Function} onPinchStart - Callback invoked when a pinch gesture initiates
     */
    detect(hands, onPinchStart) {
        let gestureName = "None";
        let spreadPct = 0;

        if (!hands || hands.length === 0) {
            this.lastPinchState = [false, false];
            return { gestureName, spreadPct };
        }

        // Measure spread on the primary hand (hand 0)
        const h0 = hands[0];
        if (h0) {
            const palmBase = h0[0]; // Wrist landmark
            const indexTip = h0[8];
            const pinkyTip = h0[20];
            
            // Average distance from wrist to fingertips
            const distIndex = getDist(palmBase, indexTip);
            const distPinky = getDist(palmBase, pinkyTip);
            const spreadDistance = (distIndex + distPinky) / 2;
            
            // Normalize: a fist wrist-to-finger distance is ~0.24, open hand is ~0.60
            // Map 0.24 -> 0% and 0.58 -> 100%
            spreadPct = Math.max(0, Math.min(100, Math.round(((spreadDistance - 0.24) / 0.34) * 100)));
            gestureName = spreadPct > 60 ? "Open Hand" : (spreadPct < 25 ? "Fist" : "Active");
        }

        // Pinch Detection for individual hands
        hands.forEach((hand, idx) => {
            if (idx > 1) return; // Limit checking to two hands

            const thumbTip = hand[4];
            const indexTip = hand[8];
            const dist = getDist(thumbTip, indexTip);
            const isPinching = dist < this.pinchThreshold;

            // Trigger event once on pinch transition
            if (isPinching && !this.lastPinchState[idx]) {
                const midpoint = {
                    x: (thumbTip.x + indexTip.x) / 2,
                    y: (thumbTip.y + indexTip.y) / 2
                };
                if (onPinchStart) {
                    onPinchStart(midpoint, idx);
                }
            }

            this.lastPinchState[idx] = isPinching;

            if (isPinching) {
                gestureName = `Pinch (Hand ${idx + 1})`;
            }
        });

        // Dual Hand Interactions
        if (hands.length >= 2) {
            const h1 = hands[0];
            const h2 = hands[1];
            
            // Calculate distance between index finger tips of both hands
            const tipDist = getDist(h1[8], h2[8]);
            
            if (tipDist < 0.12) {
                gestureName = "Cyber Fusion";
            } else if (tipDist < 0.35) {
                gestureName = "Electric Link";
            }
        }

        return { gestureName, spreadPct };
    }
}
