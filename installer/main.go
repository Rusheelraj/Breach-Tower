// Breach Tower Windows Installer
// Compiles to a single self-contained .exe — no runtime dependencies.
//
// Usage:
//
//	breach-tower-installer.exe            — fresh install
//	breach-tower-installer.exe --update   — pull latest + rebuild
//	breach-tower-installer.exe --uninstall
package main

import (
	"os"

	"github.com/Rusheelraj/Breach-Tower/installer/internal/installer"
)

func main() {
	mode := "install"
	for _, arg := range os.Args[1:] {
		switch arg {
		case "--update", "-update", "/update":
			mode = "update"
		case "--uninstall", "-uninstall", "/uninstall":
			mode = "uninstall"
		}
	}

	inst := installer.New()
	inst.Run(mode)
}
