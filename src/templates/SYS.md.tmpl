# System Persistence Guide

> **IMPORTANT**: This container resets on every rebuild. Only the `/data` folder persists across restarts.

## Understanding Container Persistence

When this container is rebuilt or restarted:
- ❌ **Lost**: Everything outside `/data` (system files, packages, configs, tools)
- ✅ **Kept**: Everything inside `/data` (workspace, skills, your files, mirror)

## Persistence Strategy

We use a **mirror-based approach**: files installed outside `/data` are mirrored to `/data/sys/mirror/`, then restored by copying back on restart.

### Directory Structure

```
/data/sys/
├── mirror/            # Mirror of system files (matches original paths)
│   ├── usr/
│   │   └── local/
│   │       └── bin/   # Mirrored binaries
│   └── etc/           # Mirrored configs
├── install-log/       # Installation records (how things were installed)
├── bin/               # Portable tools (add to PATH)
├── npm-global/        # npm global packages
├── python-venv/       # Python virtual environment
└── MANIFEST.md        # Human-readable log of all changes
```

## How to Install Things

### Method 1: Portable Installation (Preferred)

Install directly to `/data/sys/bin/` - no mirroring needed:

```bash
# Download tool to persistent location
curl -L https://example.com/tool -o /data/sys/bin/tool
chmod +x /data/sys/bin/tool

# Log the installation
cat >> /data/sys/MANIFEST.md << 'EOF'

## [$(date -Iseconds)] Installed: tool-name

**Method**: portable
**Location**: /data/sys/bin/tool
**Source**: https://example.com/tool
**Restore**: Already in /data, no action needed

EOF
```

### Method 2: Mirror Installation

When you MUST install to a system location, mirror the file:

```bash
# 1. Install the file normally
sudo cp /path/to/binary /usr/local/bin/mytool
sudo chmod +x /usr/local/bin/mytool

# 2. Mirror it to /data/sys/mirror (same path structure)
mkdir -p /data/sys/mirror/usr/local/bin
cp /usr/local/bin/mytool /data/sys/mirror/usr/local/bin/mytool

# 3. Log the installation
cat >> /data/sys/MANIFEST.md << 'EOF'

## [$(date -Iseconds)] Installed: mytool

**Method**: mirror
**System Path**: /usr/local/bin/mytool
**Mirror Path**: /data/sys/mirror/usr/local/bin/mytool
**Restore**: cp /data/sys/mirror/usr/local/bin/mytool /usr/local/bin/mytool && chmod +x /usr/local/bin/mytool

EOF

# 4. Create detailed install log for complex cases
cat > /data/sys/install-log/mytool.md << 'EOF'
# mytool Installation

## Source
- URL: https://example.com/mytool-v1.2.3.tar.gz
- Version: 1.2.3

## Installation Steps
1. Downloaded from URL
2. Extracted with: tar -xzf mytool-v1.2.3.tar.gz
3. Compiled with: make && make install
4. Installed to: /usr/local/bin/mytool

## Dependencies
- build-essential (apt)
- libssl-dev (apt)

## Restore Steps
If mirror restore fails, reinstall from source following steps above.
EOF
```

### Method 3: npm Global Packages

```bash
# Set persistent prefix (one-time setup)
npm config set prefix /data/sys/npm-global

# Install package
npm install -g <package-name>

# Log it
echo "- npm: <package-name>" >> /data/sys/MANIFEST.md
```

### Method 4: Python Packages

```bash
# Create venv (one-time)
python3 -m venv /data/sys/python-venv

# Install packages
source /data/sys/python-venv/bin/activate
pip install <package-name>

# Log it
echo "- pip: <package-name>" >> /data/sys/MANIFEST.md
```

### Method 5: apt Packages (Last Resort)

apt packages cannot be reliably mirrored. Instead:

1. **Check if a portable alternative exists** (AppImage, static binary, etc.)
2. **If apt is required**, log detailed reinstall instructions:

```bash
cat >> /data/sys/install-log/apt-packages.md << 'EOF'

## package-name

**Installed**: $(date -Iseconds)
**Command**: apt-get install -y package-name
**Purpose**: Brief description of why this is needed
**Dependencies**: List any other packages this requires

EOF
```

## Restore Process

On container restart, run the restore script:

```bash
/data/sys/restore.sh
```

This script:
1. Adds `/data/sys/bin` and `/data/sys/npm-global/bin` to PATH
2. Activates Python venv if exists
3. Copies all files from `/data/sys/mirror/` back to their original locations
4. Reports what was restored

## MANIFEST.md Format

Always log changes in `/data/sys/MANIFEST.md`:

```markdown
## [YYYY-MM-DDTHH:MM:SS] Action: Description

**Method**: portable | mirror | npm | pip | apt
**Location**: Where the file/tool is
**Mirror**: Mirror path (if applicable)
**Source**: Where it came from
**Restore**: Command to restore (if not automatic)
**Notes**: Any additional information
```

## Checking What's Installed

```bash
# View manifest
cat /data/sys/MANIFEST.md

# List mirrored files
find /data/sys/mirror -type f

# List portable tools
ls -la /data/sys/bin/

# List npm global packages
ls /data/sys/npm-global/lib/node_modules/

# List Python packages
/data/sys/python-venv/bin/pip list
```

## Quick Reference

| What | Best Method | Location |
|------|-------------|----------|
| CLI tools | Portable | `/data/sys/bin/` |
| npm packages | npm prefix | `/data/sys/npm-global/` |
| Python packages | venv | `/data/sys/python-venv/` |
| System binaries | Mirror | `/data/sys/mirror/usr/...` |
| Config files | Mirror | `/data/sys/mirror/etc/...` |
| apt packages | Log only | `/data/sys/install-log/apt-packages.md` |

---

**Remember**: 
1. Prefer portable installations over system installations
2. Always mirror files installed outside `/data`
3. Log everything in `MANIFEST.md`
4. For complex installs, create detailed logs in `install-log/`
