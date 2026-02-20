import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const CONFIG_FILE = path.join(process.cwd(), '.minas-cli.config.json');

let memoryConfig = null;
let configLock = Promise.resolve();

export async function getConfig() {
    if (memoryConfig !== null) return memoryConfig;
    try {
        const data = await fs.readFile(CONFIG_FILE, 'utf8');
        memoryConfig = JSON.parse(data);
        return memoryConfig;
    } catch (error) {
        memoryConfig = {};
        return memoryConfig;
    }
}

export async function getPersistentSubdomain() {
    const config = await getConfig();
    if (config.persistentSubdomain) return config.persistentSubdomain;

    const randomId = Math.random().toString(36).substring(2, 8);
    const newSubdomain = `minas-${randomId}`;
    await setConfig({ persistentSubdomain: newSubdomain });
    return newSubdomain;
}

export async function isReady() {
    const config = await getConfig();
    return !!(config && config.password);
}

export async function hasPassword() {
    const config = await getConfig();
    return !!(config && config.password);
}


export async function setConfig(newConfig) {
    const operation = async () => {
        const currentConfig = await getConfig();
        const mergedConfig = { ...currentConfig, ...newConfig };
        memoryConfig = mergedConfig; // Instantly sync to memory cache
        // Wait till previous configurations are populated or saved properly to avoid truncation
        const tempFile = `${CONFIG_FILE}.tmp.${Date.now()}`;
        try {
            await fs.writeFile(tempFile, JSON.stringify(mergedConfig, null, 2));
            await fs.rename(tempFile, CONFIG_FILE);
        } catch (e) {
            // Ignore minor I/O block errors during burst, memory config handles it
        }
        return memoryConfig;
    };
    configLock = configLock.then(operation).catch(operation);
    return configLock;
}

export async function getJwtSecret() {
    const config = await getConfig();
    if (config && config.jwtSecret) return config.jwtSecret;

    const secret = uuidv4();
    await setConfig({ jwtSecret: secret });
    return secret;
}

// User & Device Management Helpers
export async function getUsers() {
    const config = await getConfig();
    return config.users || [];
}

export async function getDevices() {
    const config = await getConfig();
    return config.devices || [];
}

export async function saveDevice(device) {
    const config = await getConfig();
    const devices = config.devices || [];
    const index = devices.findIndex(d => d.id === device.id);
    if (index !== -1) {
        devices[index] = { ...devices[index], ...device };
    } else {
        devices.push(device);
    }
    await setConfig({ devices });
}

export async function getBannedDevices() {
    const config = await getConfig();
    return config.bannedDevices || [];
}

export async function banDevice(deviceId) {
    const config = await getConfig();
    const bannedDevices = config.bannedDevices || [];
    if (!bannedDevices.includes(deviceId)) {
        bannedDevices.push(deviceId);
        await setConfig({ bannedDevices });
    }
    // Also update device status in list
    const devices = config.devices || [];
    const device = devices.find(d => d.id === deviceId);
    if (device) {
        device.status = 'banned';
        await setConfig({ devices });
    }
}

export async function unbanDevice(deviceId) {
    const config = await getConfig();
    let bannedDevices = config.bannedDevices || [];
    bannedDevices = bannedDevices.filter(id => id !== deviceId);
    await setConfig({ bannedDevices });

    // Also update device status in list
    const devices = config.devices || [];
    const device = devices.find(d => d.id === deviceId);
    if (device) {
        device.status = 'active';
        await setConfig({ devices });
    }
}
