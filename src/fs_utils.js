import fs from 'fs/promises';
import path from 'path';

import CryptoJS from 'crypto-js';
import { getConfig } from './config.js';

export async function getNasRoot() {
    const config = await getConfig();
    return config?.nasPath || null;
}

export async function getStorageStats() {
    const root = await getNasRoot();
    if (!root) throw new Error('NAS Root not configured');
    try {
        const stats = await fs.statfs(root);
        const total = stats.blocks * stats.bsize;
        const available = stats.bavail * stats.bsize;
        const used = total - available;
        return { total, used, available };
    } catch (err) {
        return { total: 0, used: 0, available: 0 };
    }
}

export async function validatePath(userPath) {
    const root = await getNasRoot();
    if (!root) throw new Error('NAS Root not configured');

    if (userPath.includes('\0')) {
        throw new Error('Access denied: Invalid characters detected');
    }

    // Normalize path to handle both absolute and relative inputs safely
    const normalizedTarget = path.join(root, userPath);
    const resolvedTarget = path.resolve(normalizedTarget);
    const resolvedRoot = path.resolve(root);

    if (!resolvedTarget.startsWith(resolvedRoot)) {
        throw new Error('Access denied: Directory traversal detected');
    }

    return resolvedTarget;
}





export async function calculateHash(filePath) {
    const fileBuffer = await fs.readFile(filePath);
    // Convert Buffer to WordArray for CryptoJS
    const wordArray = CryptoJS.lib.WordArray.create(fileBuffer);
    const hash = CryptoJS.SHA256(wordArray);
    return hash.toString(CryptoJS.enc.Hex);
}

export async function fileExistsInNas(nasRoot, hash) {
    // For simplicity, we'll store hashes of uploaded files in the config or a separate manifest.
    // However, to keep it purely FS-based and robust:
    // We would need to scan. For now, let's assume we maintain a 'manifest' in config.
    const config = await getConfig();
    const hashes = config.fileHashes || {};
    return Object.values(hashes).includes(hash);
}

export async function listDirectory(safePath) {
    const entries = await fs.readdir(safePath, { withFileTypes: true });

    const result = await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(safePath, entry.name);
        let stats;
        try {
            stats = await fs.stat(entryPath);
        } catch (e) {
            return null;
        }

        return {
            name: entry.name,
            type: entry.isDirectory() ? 'folder' : 'file',
            size: stats.size,
            lastModified: stats.mtime
        };
    }));

    return result.filter(Boolean);
}

export async function deleteItem(safePath) {
    const stats = await fs.stat(safePath);
    if (stats.isDirectory()) {
        await fs.rm(safePath, { recursive: true, force: true });
    } else {
        await fs.unlink(safePath);
    }
}

export async function createFolder(safePath) {
    await fs.mkdir(safePath, { recursive: true });
}
