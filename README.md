# 🚀 Minas CLI

**Minas** is a zero-configuration, secure Network Attached Storage (NAS) application that you can launch instantly from your terminal. It allows you to securely share and manage your local files over the internet with zero network setup.

## ✨ Features

- **Zero Config**: No port forwarding or complex network setup required.
- **Secure Tunnel**: Automatically uses an SSH tunnel to create a secure public URL.
- **Instant Access**: Prints a QR Code in the terminal for immediate mobile access.
- **Protected**: Password-protected access with JWT session management.
- **Mobile Friendly**: Modern, responsive, glassmorphic web dashboard.
- **File Management**: Upload, download, create folders, and delete files from anywhere.

## 🚀 Quick Start

Launch Minas directly without installing using `npx`:

```bash
npx @catcode/minas-cli
```
*Note: On your first run, you will be prompted to set up a master password.*

Once started:
1. **Copy the URL** or **Scan the QR Code** printed in your terminal.
2. **Access your files** securely from anywhere in the world!

## 🛠️ Installation (Global)

If you want to use it frequently, you can install it globally to your system:

```bash
npm install -g @catcode/minas-cli
```

### Setup Master Password

Before starting the server, configure your master password::

```bash
minas-cli config password
```

### Start the Server

```bash
minas-cli
```

## 💻 Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/minas-cli.git
   cd minas-cli
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```

## 🔒 Security

- Your password is never stored in plain text (hashed via `bcrypt`).
- All file operations are protected by secure JWT authentication.
- Strict path sanitization limits access to prevent directory traversal attacks.
- Only the configured storage directory is exposed.

## 📄 License

ISC License
