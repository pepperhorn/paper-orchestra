// ghost.js — Ghost marker detection (covered = activated)

/**
 * Determine which control markers are covered (not visible in the current frame).
 * Position markers are excluded since they must remain visible for spatial reference.
 *
 * @param {Object} knownMarkers - All markers found during scan, keyed by ID
 * @param {Set<number>} visibleSet - Set of marker IDs visible in the current frame
 * @param {Set<number>} positionTagSet - Set of marker IDs that are position references (not controls)
 * @returns {Set<number>} Set of covered (activated) control marker IDs
 */
export function detectCoveredMarkers(knownMarkers, visibleSet, positionTagSet) {
  const covered = new Set()
  for (const id of Object.keys(knownMarkers)) {
    const numId = Number(id)
    if (positionTagSet.has(numId)) continue
    if (!visibleSet.has(numId)) covered.add(numId)
  }
  return covered
}
