#!/usr/bin/env node

import { Command } from 'commander';
import { startServer } from '../src/server.js';
import { setupTunnel } from '../src/tunnel.js';
import { getConfig, setConfig, hasPassword } from '../src/config.js';
import { hashPassword } from '../src/auth.js';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';
import readline from 'readline';

const program = new Command();

program
    .name('minas-cli')
    .description('Zero-config NAS exposed via public tunnel')
    .version('1.0.0');

// Config Password Command
program
    .command('config')
    .description('Configure Minas settings')
    .argument('<setting>', 'Setting to change (e.g. password)')
    .action(async (setting) => {
        if (setting === 'password') {
            const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

            const question = (query) => new Promise((resolve) => rl.question(query, resolve));

            console.log(chalk.yellow('\n🔐 Change Master Password'));

            let pass = '';
            let confirm = '';

            while (true) {
                pass = await question('Enter new master password: ');
                if (pass.length < 4) {
                    console.log(chalk.red('Password must be at least 4 characters.\n'));
                    continue;
                }
                confirm = await question('Confirm password: ');
                if (pass !== confirm) {
                    console.log(chalk.red('Passwords do not match. Try again.\n'));
                    continue;
                }
                break;
            }

            const hashed = await hashPassword(pass);
            await setConfig({ password: hashed });
            console.log(chalk.green('\n✅ Password updated successfully!\n'));
            rl.close();
        } else {
            console.log(chalk.red(`\n❌ Unknown setting: ${setting}`));
        }
        process.exit(0);
    });

// Default action (Start Server)
program
    .action(async () => {
        console.log(chalk.blue(`🚀 Minas server starting...`));

        try {
            if (!(await hasPassword())) {
                console.log(chalk.yellow('\n🔐 Setup Required'));
                console.log(chalk.dim('Please set a master password before starting the server:'));
                console.log(chalk.cyan('  minas-cli config password\n'));
                process.exit(1);
            }

            const { server, port } = await startServer();

            // Load existing config
            const config = (await getConfig()) || {};

            // Auto-configure storage path if not set
            if (!config.nasPath) {
                const defaultPath = path.join(process.cwd(), 'storage');
                await setConfig({ nasPath: defaultPath });
                config.nasPath = defaultPath;
                try {
                    await fs.mkdir(defaultPath, { recursive: true });
                    console.log(chalk.dim(`  Created default storage folder: ${defaultPath}`));
                } catch (err) { }
            }

            // Always use SSH tunnel for simplicity as requested (or follow default)
            // The user wanted to remove network tunnel configuration.
            const tunnelConfig = {
                provider: 'ssh' // Defaulting to SSH for zero-config simplicity
            };

            // Small delay to ensure server is fully bound
            setTimeout(async () => {
                const tunnel = await setupTunnel(port, null, tunnelConfig);

                process.on('SIGINT', () => {
                    console.log(chalk.yellow('\n👋 Shutting down Minas...'));
                    if (tunnel && tunnel.close) tunnel.close();
                    server.close();
                    process.exit(0);
                });
            }, 500);

        } catch (error) {
            if (error.message.includes('EADDRINUSE')) {
                console.error(chalk.red('\n  ❌ Error: Port 3000 is already in use!'));
                console.log(chalk.dim('  Please close the other application or previous Minas instance and try again.\n'));
            } else {
                console.error(chalk.red('Failed to start Minas:'), error.message);
            }
            process.exit(1);
        }
    });

program.parse(process.argv);
