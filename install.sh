#!/bin/bash
set -e

REPO="pompeii-labs/vesuvio"
MODIFY_PATH=true

for arg in "$@"; do
    case "$arg" in
        --no-modify-path) MODIFY_PATH=false ;;
    esac
done

echo "Installing Vesuvio..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$ARCH" in
    x86_64) ARCH="x64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: $ARCH"; exit 1 ;;
esac

BINARY="vesuvio-${OS}-${ARCH}"
INSTALL_DIR="${HOME}/.local/bin"

mkdir -p "$INSTALL_DIR"

echo "Fetching latest release..."
LATEST=$(curl -fsSL https://api.github.com/repos/$REPO/releases/latest | grep '"tag_name"' | cut -d'"' -f4)

if [ -z "$LATEST" ]; then
    echo "Error: could not fetch latest release"
    exit 1
fi

echo "Downloading $BINARY ($LATEST)..."
curl -fsSL "https://github.com/$REPO/releases/download/$LATEST/$BINARY" -o "$INSTALL_DIR/vesuvio"
chmod +x "$INSTALL_DIR/vesuvio"

if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
    export PATH="$INSTALL_DIR:$PATH"

    if [[ "$MODIFY_PATH" == true ]]; then
        SHELL_NAME=$(basename "$SHELL")
        case "$SHELL_NAME" in
            zsh)  PROFILE="$HOME/.zshrc" ;;
            bash)
                if [[ -f "$HOME/.bash_profile" ]]; then
                    PROFILE="$HOME/.bash_profile"
                else
                    PROFILE="$HOME/.bashrc"
                fi
                ;;
            *)    PROFILE="" ;;
        esac

        if [[ -n "$PROFILE" ]]; then
            echo '' >> "$PROFILE"
            echo '# Vesuvio' >> "$PROFILE"
            echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$PROFILE"
            echo "Added $INSTALL_DIR to PATH in $PROFILE"
        fi
    fi
fi

echo ""
echo "Vesuvio $LATEST installed to $INSTALL_DIR/vesuvio"
echo ""
echo "Next steps:"
echo "  vesuvio setup    # configure services"
echo "  vesuvio start    # start the daemon"
echo "  vesuvio          # open the TUI"
echo ""
