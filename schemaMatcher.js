
/**
 * Calculates the Levenshtein distance between two strings.
 * @param {string} a 
 * @param {string} b 
 * @returns {number} The distance
 */
function levenshteinDistance(a, b) {
    const matrix = [];

    // Increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // Increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) == a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Normalizes a string for comparison (lowercase, remove specific punctuation).
 * @param {string} str 
 * @returns {string}
 */
function normalizeString(str) {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Finds the best match for a candidate string from a list of targets.
 * @param {string} candidate The string to match (extracted from OCR)
 * @param {string[]} targets The list of valid canonical keys
 * @param {number} threshold Max allowed distance ratio (0.0 - 1.0). Default 0.4 (40% difference allowed but be careful)
 * @returns {string|null} The best matching target, or null if no match found within threshold.
 */
function findBestMatch(candidate, targets, threshold = 0.4) {
    if (!candidate || !targets || targets.length === 0) return null;

    let bestMatch = null;
    let minDistance = Infinity;

    const normalizedCandidate = normalizeString(candidate);

    for (const target of targets) {
        // Direct match check
        if (candidate === target) return target;

        const normalizedTarget = normalizeString(target);

        // Optimization: if normalized strings are identical, it's a match (ignoring case/punctuation)
        if (normalizedCandidate === normalizedTarget) {
            // Prefer the target's exact casing/formatting
            // But we should continue to check if there's an even better match? 
            // Normalized equality is pretty strong.
            return target;
        }

        const dist = levenshteinDistance(normalizedCandidate, normalizedTarget);

        // Calculate ratio based on longer string to handle length differences fairly
        const maxLength = Math.max(normalizedCandidate.length, normalizedTarget.length);
        const ratio = dist / maxLength;

        if (ratio < threshold && dist < minDistance) {
            minDistance = dist;
            bestMatch = target;
        }
    }

    return bestMatch;
}

module.exports = {
    findBestMatch,
    levenshteinDistance
};
