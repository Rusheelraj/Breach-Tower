package installer

import (
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

// isAdmin returns true if the current process has Administrator privileges.
func isAdmin() bool {
	var token windows.Token
	if err := windows.OpenProcessToken(windows.CurrentProcess(), windows.TOKEN_QUERY, &token); err != nil {
		return false
	}
	defer token.Close()
	var elevated uint32
	var size uint32
	err := windows.GetTokenInformation(token, windows.TokenElevation,
		(*byte)(unsafe.Pointer(&elevated)), 4, &size)
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
	var argParts []string
	if len(os.Args) > 1 {
		argParts = os.Args[1:]
	}
	args := strings.Join(argParts, " ")

	shell32 := syscall.NewLazyDLL("shell32.dll")
	shellExec := shell32.NewProc("ShellExecuteW")

	verbPtr, _ := syscall.UTF16PtrFromString("runas")
	exePtr, _ := syscall.UTF16PtrFromString(exe)
	var argsPtr *uint16
	if args != "" {
		argsPtr, _ = syscall.UTF16PtrFromString(args)
	}

	ret, _, _ := shellExec.Call(
		0,
		uintptr(unsafe.Pointer(verbPtr)),
		uintptr(unsafe.Pointer(exePtr)),
		uintptr(unsafe.Pointer(argsPtr)),
		0,
		uintptr(windows.SW_NORMAL),
	)
	if ret <= 32 {
		die("Failed to request elevation (ShellExecuteW returned error).")
	}
	os.Exit(0)
}
