UUID := netbird-status@iiaku
INSTALL_DIR := $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
BIN := node_modules/.bin

# Derive version from the latest git tag (v3 → 3). Falls back to metadata.json.
GIT_VERSION := $(shell git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')
VERSION := $(or $(GIT_VERSION),$(shell jq -r .version metadata.json))

.PHONY: all build schemas install uninstall enable disable reload logs pack clean typecheck lint format knip dev-reload test

all: build schemas

build:
	@echo "==> Bundling TypeScript (extension + prefs)"
	@bun run build:bundle

typecheck:
	@$(BIN)/tsc -p tsconfig.extension.json
	@$(BIN)/tsc -p tsconfig.prefs.json

lint:
	@$(BIN)/oxlint src

format:
	@$(BIN)/oxfmt --write src

knip:
	@$(BIN)/knip

test:
	@bun test test/unit

schemas:
	@echo "==> Compiling gschemas"
	@glib-compile-schemas schemas/

install: build schemas
	@echo "==> Installing to $(INSTALL_DIR)"
	@mkdir -p $(INSTALL_DIR)
	@cp dist/extension.js dist/prefs.js $(INSTALL_DIR)/
	@mkdir -p $(INSTALL_DIR)/schemas $(INSTALL_DIR)/icons
	@jq '.version = $(VERSION)' metadata.json > $(INSTALL_DIR)/metadata.json
	@cp stylesheet.css $(INSTALL_DIR)/
	@cp schemas/*.xml $(INSTALL_DIR)/schemas/
	@glib-compile-schemas $(INSTALL_DIR)/schemas/
	@cp icons/*.svg $(INSTALL_DIR)/icons/
	@echo "==> Installed. Now: make enable && log out/in (Wayland) or Alt+F2 r (X11)"

uninstall:
	@rm -rf $(INSTALL_DIR)
	@echo "==> Removed $(INSTALL_DIR)"

enable:
	@gnome-extensions enable $(UUID) || true

disable:
	@gnome-extensions disable $(UUID) || true

reload: install
	@echo "==> Wayland: log out & back in. X11: Alt+F2, type 'r', Enter."

logs:
	@journalctl --user -f -o cat | grep -iE 'netbird-status|gjs|gnome-shell'

pack: build schemas
	@rm -f $(UUID).shell-extension.zip
	@mkdir -p /tmp/$(UUID)-pack/schemas /tmp/$(UUID)-pack/icons
	@cp dist/extension.js dist/prefs.js /tmp/$(UUID)-pack/
	@jq '.version = $(VERSION)' metadata.json > /tmp/$(UUID)-pack/metadata.json
	@cp stylesheet.css /tmp/$(UUID)-pack/
	@cp schemas/*.xml /tmp/$(UUID)-pack/schemas/
	@cp icons/*.svg /tmp/$(UUID)-pack/icons/
	@(cd /tmp/$(UUID)-pack && zip -rq $(CURDIR)/$(UUID).shell-extension.zip .)
	@rm -rf /tmp/$(UUID)-pack
	@echo "==> Built $(UUID).shell-extension.zip (version $(VERSION))"

clean:
	@rm -rf dist schemas/gschemas.compiled $(UUID).shell-extension.zip

dev-reload:
	@scripts/dev-reload.sh
