import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { validatePath, listDirectory, deleteItem, createFolder, calculateHash, getStorageStats } from '../fs_utils.js';
import { requireAuth } from '../auth.js';
import { setConfig, getConfig } from '../config.js';
import convert from 'heic-convert';

const router = express.Router();

// Apply authentication to all file system routes
router.use(requireAuth);



router.get('/stats', async (req, res) => {
    try {
        const stats = await getStorageStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/list', async (req, res) => {
    try {
        const requestedPath = req.query.path || '/';
        const safePath = await validatePath(requestedPath);
        const files = await listDirectory(safePath);
        res.json(files);
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.get('/download', async (req, res) => {
    try {
        const requestedPath = req.query.path;
        if (!requestedPath) return res.status(400).json({ error: 'Path required' });

        const safePath = await validatePath(requestedPath);
        res.download(safePath);
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.get('/preview', async (req, res) => {
    try {
        const requestedPath = req.query.path;
        if (!requestedPath) return res.status(400).json({ error: 'Path required' });

        const safePath = await validatePath(requestedPath);
        const lowerPath = safePath.toLowerCase();

        if (lowerPath.endsWith('.heic') || lowerPath.endsWith('.heif')) {
            const buffer = await fs.readFile(safePath);
            const jpegBuffer = await convert({
                buffer: buffer,
                format: 'JPEG',
                quality: 0.5
            });
            res.setHeader('Content-Type', 'image/jpeg');
            return res.send(Buffer.from(jpegBuffer));
        }

        res.sendFile(safePath);
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.post('/upload', async (req, res) => {
    try {
        const requestedPath = req.query.path || '/';
        const safePath = await validatePath(requestedPath);

        if (!req.files || Object.keys(req.files).length === 0) {
            return res.status(400).json({ error: 'No files were uploaded.' });
        }

        const uploadedFiles = Array.isArray(req.files.files) ? req.files.files : [req.files.files];
        const config = await getConfig();
        const fileHashes = config.fileHashes || {};
        const newHashes = { ...fileHashes };

        for (const file of uploadedFiles) {
            const tempPath = path.join(process.cwd(), 'temp_' + Date.now() + '_' + file.name);
            await file.mv(tempPath);

            const hash = await calculateHash(tempPath);
            const currentConfig = await getConfig();
            const currentHashes = currentConfig.fileHashes || {};

            if (Object.values(currentHashes).includes(hash)) {
                await fs.unlink(tempPath);
                // Return success anyway for batch queue, but log skipped
                continue;
            }

            // Client optionally sends full nested path as query 'path' for folders
            // or we use standard path
            const uploadDir = safePath;
            // Ensure full nested directory path actually exists locally
            await fs.mkdir(uploadDir, { recursive: true });

            const uploadPath = path.join(uploadDir, file.name);
            await fs.rename(tempPath, uploadPath);

            // Incrementally append to prevent strict race conditions during bulk uploads
            await setConfig({ fileHashes: { ...(await getConfig()).fileHashes, [uploadPath]: hash } });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.post('/folder', async (req, res) => {
    try {
        const { path: parentPath, folderName } = req.body;
        if (!folderName) return res.status(400).json({ error: 'Folder name required' });

        const safePath = await validatePath(path.join(parentPath || '/', folderName));
        await createFolder(safePath);
        res.json({ success: true });
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.delete('/item', async (req, res) => {
    try {
        const requestedPath = req.query.path;
        if (!requestedPath) return res.status(400).json({ error: 'Path required' });

        const safePath = await validatePath(requestedPath);
        await deleteItem(safePath);

        // Remove from hash map
        const config = await getConfig();
        if (config.fileHashes && config.fileHashes[safePath]) {
            const newHashes = { ...config.fileHashes };
            delete newHashes[safePath];
            await setConfig({ fileHashes: newHashes });
        }

        res.json({ success: true });
    } catch (error) {
        res.status(error.message.includes('Access denied') ? 403 : 500).json({ error: error.message });
    }
});

router.post('/batch-delete', async (req, res) => {
    try {
        const { paths } = req.body;
        if (!paths || !Array.isArray(paths)) return res.status(400).json({ error: 'Paths array required' });

        const config = await getConfig();
        const newHashes = { ...config.fileHashes };

        for (const requestedPath of paths) {
            const safePath = await validatePath(requestedPath);
            await deleteItem(safePath);
            if (newHashes[safePath]) delete newHashes[safePath];
        }

        await setConfig({ fileHashes: newHashes });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
