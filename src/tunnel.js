import { spawn } from 'child_process';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';
import open from 'open';
import localtunnel from 'localtunnel';
import ngrok from '@ngrok/ngrok';
import https from 'https';

function displaySuccess(url, port, accessPass) {
    const localUrl = `http://127.0.0.1:${port}`;
    console.log('\n' + chalk.cyan('─'.repeat(60)));
    console.log(chalk.bold.green('  🚀 Minas is live!'));
    console.log(chalk.cyan('─'.repeat(60)));
    console.log(`${chalk.bold('  Local URL:   ')} ${chalk.underline.blue(localUrl)}`);
    console.log(`${chalk.bold('  Public URL:  ')} ${chalk.underline.green(url)}`);
    if (accessPass) {
        console.log(`${chalk.bold('  Tunnel Pass: ')} ${chalk.bgWhite.black(` ${accessPass} `)}`);
    }
    console.log(chalk.cyan('─'.repeat(60)) + '\n');
    open(localUrl).catch(() => { });
    console.log(chalk.bold('  Scan to access:'));
    qrcode.generate(url, { small: true });
}

async function setupSshTunnel(port, accessPass) {
    console.log(chalk.dim('  Setting up Secure SSH tunnel (localhost.run)...'));
    return new Promise((resolve) => {
        const ssh = spawn('ssh', [
            '-o', 'StrictHostKeyChecking=no',
            '-o', 'ServerAliveInterval=60',
            '-R', `80:127.0.0.1:${port}`,
            'nokey@localhost.run'
        ]);

        let urlFound = false;

        ssh.stdout.on('data', (data) => {
            const output = data.toString();
            const match = output.match(/https:\/\/[a-z0-9-]+\.lhr\.life/);

            if (match && !urlFound) {
                urlFound = true;
                const url = match[0];
                displaySuccess(url, port, accessPass);
                resolve({ url, close: () => ssh.kill() });
            }
        });

        ssh.on('error', (err) => {
            if (!urlFound) {
                console.error(chalk.red('  ❌ SSH Tunnel failed:'), err.message);
                resolve(null);
            }
        });

        setTimeout(() => {
            if (!urlFound) {
                console.log(chalk.yellow('  ⚠️ SSH Tunnel setup timed out...'));
                resolve(null);
            }
        }, 15000);
    });
}

async function setupLocaltunnel(port, _, subdomain) {
    console.log(chalk.dim(`  Setting up Localtunnel${subdomain ? ` (Subdomain: ${subdomain})` : ''}...`));
    try {
        // Fetch tunnel password (public IP) from bypass service
        const tunnelPassword = await new Promise((resolve) => {
            https.get('https://loca.lt/mytunnelpassword', (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => resolve(data.trim()));
            }).on('error', () => resolve(null));
        });

        const tunnel = await localtunnel({ port, subdomain: subdomain || undefined });
        displaySuccess(tunnel.url, port, tunnelPassword);

        tunnel.on('error', err => {
            console.error(chalk.red('  ❌ Localtunnel Error:'), err.message);
        });

        return { url: tunnel.url, close: () => tunnel.close() };
    } catch (err) {
        console.error(chalk.red('  ❌ Localtunnel failed:'), err.message);
        return null;
    }
}

async function setupNgrok(port, accessPass, authtoken, domain) {
    console.log(chalk.dim(`  Setting up Ngrok tunnel${domain ? ` (Domain: ${domain})` : ''}...`));
    try {
        const options = { addr: port };
        if (authtoken) options.authtoken = authtoken;
        if (domain) options.domain = domain;

        const url = await ngrok.connect(options);
        displaySuccess(url, port, accessPass);

        return { url, close: async () => await ngrok.disconnect() };
    } catch (err) {
        console.error(chalk.red('  ❌ Ngrok failed:'), err.message);
        return null;
    }
}

export async function setupTunnel(port, accessPass, config = {}) {
    const { provider = 'ssh', subdomain = null, ngrokToken = null } = config;

    let tunnelRes;

    if (provider === 'localtunnel') {
        tunnelRes = await setupLocaltunnel(port, accessPass, subdomain);
    } else if (provider === 'ngrok') {
        tunnelRes = await setupNgrok(port, accessPass, ngrokToken, subdomain.includes('.') ? subdomain : null);
    } else {
        tunnelRes = await setupSshTunnel(port, accessPass);
    }

    // Fallback if the chosen tunnel failed
    if (!tunnelRes && provider !== 'ssh') {
        console.log(chalk.yellow(`  ⚠️ Failed to setup ${provider}. Falling back to default SSH tunnel...`));
        tunnelRes = await setupSshTunnel(port, accessPass);
    }

    if (!tunnelRes) {
        console.log(chalk.dim('  Running in local-only mode.'));
    }

    return tunnelRes;
}
