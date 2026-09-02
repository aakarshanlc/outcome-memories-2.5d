export function checkCircleBoxCollision(cx, cz, radius, bx, bz, bw, bd) {
    let closestX = Math.max(bx, Math.min(cx, bx + bw));
    let closestZ = Math.max(bz, Math.min(cz, bz + bd));
    let distanceX = cx - closestX;
    let distanceZ = cz - closestZ;
    return (distanceX * distanceX) + (distanceZ * distanceZ) < (radius * radius);
}

export function checkCircleCircleCollision(x1, z1, r1, x2, z2, r2) {
    let dx = x1 - x2;
    let dz = z1 - z2;
    let distSq = (dx * dx) + (dz * dz);
    let radiusSum = r1 + r2;
    return distSq < (radiusSum * radiusSum);
}
