package installer

import (
	"os"
	"path/filepath"
	"syscall"

	"golang.org/x/sys/windows"
)

// isAdmin returns true if the current process has Administrator privileges.
func isAdmin() bool {
	token := windows.Token(0)
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return false
	}
	defer token.Close()
	var elevated uint32
	var size uint32
	err := windows.GetTokenInformation(token, windows.TokenElevation, (*byte)(syscall.Pointer(&elevated)), 4, &size)
	return err == nil && elevated != 0
}

// requireAdmin re-launches the current executable with runas (UAC prompt)
// if not already running as Administrator, then exits the current process.
func requireAdmin() {
	if isAdmin() {
		return
	}
	logInfo("Requesting Administrator privileges (UAC prompt)...")

	exe, err := os.Executable()
	if err != nil {
		die("Cannot determine executable path: " + err.Error())
	}
	exe, _ = filepath.Abs(exe)

	// Build the argument string for the re-launch
	args := ""
	if len(os.Args) > 1 {
		for i, a := range os.Args[1:] {
			if i > 0 {
				args += " "
			}
			args += a
		}
	}

	verb, _ := syscall.UTF16PtrFromString("runas")
	exePtr, _ := syscall.UTF16PtrFromString(exe)
	var argsPtr *uint16
	if args != "" {
		argsPtr, _ = syscall.UTF16PtrFromString(args)
	}

	err = windows.ShellExecute(0, verb, exePtr, argsPtr, nil, windows.SW_NORMAL)
	if err != nil {
		die("Failed to request elevation: " + err.Error())
	}
	os.Exit(0)
}
