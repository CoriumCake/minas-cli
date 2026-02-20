import express from 'express';
import { hasPassword, setConfig, getConfig, saveDevice, getDevices, banDevice, unbanDevice } from '../config.js';
import { hashPassword, comparePassword, generateToken, requireAuth } from '../auth.js';

const router = express.Router();

router.get('/status', async (req, res) => {
    const passwordSet = await hasPassword();
    res.json({
        isConfigured: passwordSet,
        needsPassword: !passwordSet
    });
});

router.post('/login', async (req, res) => {
    const { password, deviceId, deviceName } = req.body;
    const config = await getConfig();

    if (!config || !config.password) {
        return res.status(400).json({ error: 'Not configured' });
    }

    const isValid = await comparePassword(password, config.password);
    if (!isValid) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    const token = await generateToken({
        role: 'admin',
        deviceId
    });

    res.json({ success: true, token });
});

router.post('/change-password', requireAuth, async (req, res) => {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'Password must be at least 4 characters long' });
    }
    const hashedPassword = await hashPassword(newPassword);
    await setConfig({ password: hashedPassword });
    res.json({ success: true, message: 'Password updated successfully' });
});

export default router;
