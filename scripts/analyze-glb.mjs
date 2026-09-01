import fs from 'fs';

// Parse a GLB's JSON chunk and report per-mesh POSITION bounds + node transforms,
function analyze(path) {
    const buf = fs.readFileSync(path);
    const magic = buf.readUInt32LE(0);
    const version = buf.readUInt32LE(4);
    if (magic !== 0x46546C67) throw new Error('not a GLB');
    let off = 12;
    let json = null, binOffset = 0, binLength = 0;
    while (off < buf.length) {
        const chunkLen = buf.readUInt32LE(off);
        const chunkType = buf.readUInt32LE(off + 4);
        if (chunkType === 0x4E4F534A) json = JSON.parse(buf.slice(off + 8, off + 8 + chunkLen).toString('utf8'));
        if (chunkType === 0x004E4942) { binOffset = off + 8; binLength = chunkLen; }
        off += 8 + chunkLen;
    }

    console.log(`\n=== ${path} ===`);
    console.log(`glTF version: ${version}, generator-ish asset: ${JSON.stringify(json.asset || {})}`);

    // Global bounds across all POSITION accessors (raw vertex data)
    let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    const compTypeSize = { 5126: 4, 5123: 2, 5125: 4 };
    for (const mesh of json.meshes || []) {
        for (const prim of mesh.primitives) {
            const posAcc = json.accessors[prim.attributes.POSITION];
            if (!posAcc || !posAcc.min || !posAcc.max) continue;
            for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i], posAcc.min[i]);
                max[i] = Math.max(max[i], posAcc.max[i]);
            }
        }
    }
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    console.log(`raw bounds: min=[${min.map(v => v.toFixed(2))}] max=[${max.map(v => v.toFixed(2))}]`);
    console.log(`extents:    X=${ext[0].toFixed(2)}  Y=${ext[1].toFixed(2)}  Z=${ext[2].toFixed(2)}`);

    // Node transforms (do any nodes carry non-identity rotation?)
    const rotNodes = [];
    const walk = (idx, depth) => {
        const n = json.nodes[idx];
        if (n.rotation && (Math.abs(n.rotation[0]) > 1e-6 || Math.abs(n.rotation[1]) > 1e-6 || Math.abs(n.rotation[2]) > 1e-6)) {
            rotNodes.push({ name: n.name, rotation: n.rotation.map(v => v.toFixed(3)), mesh: n.mesh });
        }
        if (n.children) n.children.forEach(c => walk(c, depth + 1));
    };
    (json.scenes[0].nodes || []).forEach(n => walk(n, 0));
    console.log(`nodes with rotation: ${rotNodes.length ? JSON.stringify(rotNodes.slice(0, 8), null, 1) : 'none'}`);

    // Per-axis asymmetry of raw bounds (offset from center) — quills/nose hint front/back
    const mid = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    console.log(`center: [${mid.map(v => v.toFixed(2))}]  (asymmetry: +X ${(max[0] - mid[0]).toFixed(2)} vs -X ${(mid[0] - min[0]).toFixed(2)}, +Z ${(max[2] - mid[2]).toFixed(2)} vs -Z ${(mid[2] - min[2]).toFixed(2)})`);
}

analyze('src/assets/models/2011X/2011x.glb');
analyze('src/assets/models/Starved/starved_eggman.glb');
