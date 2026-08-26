export function checkCircleBoxCollision(cx, cz, radius, bx, bz, bw, bd) {
    let closestX = Math.max(bx, Math.min(cx, bx + bw));
    let closestZ = Math.max(bz, Math.min(cz, bz + bd));
    let distanceX = cx - closestX;
    let distanceZ = cz - closestZ;
    return (distanceX * distanceX) + (distanceZ * distanceZ) < (radius * radius);
}