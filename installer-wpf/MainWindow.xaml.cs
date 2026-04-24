using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Threading.Tasks;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Documents;
using System.Windows.Media;
using BreachTowerInstaller.Core;

namespace BreachTowerInstaller;

public partial class MainWindow : Window
{
    // ── Step definitions ──────────────────────────────────────────────────────
    private static readonly string[] StepNames =
    [
        "Welcome",
        "Configure",
        "Install",
        "Complete",
    ];

    private int    _currentStep = 0;
    private string _dashboardUrl = "http://localhost:3000";
    private CancellationTokenSource? _cts;

    // ── Colour map ────────────────────────────────────────────────────────────
    private static readonly Dictionary<string, SolidColorBrush> Colours = new()
    {
        ["info"]    = new SolidColorBrush(Color.FromRgb(0x38, 0xbd, 0xf8)),  // sky
        ["success"] = new SolidColorBrush(Color.FromRgb(0x22, 0xc5, 0x5e)),  // green
        ["warn"]    = new SolidColorBrush(Color.FromRgb(0xf5, 0x9e, 0x0b)),  // amber
        ["error"]   = new SolidColorBrush(Color.FromRgb(0xef, 0x44, 0x44)),  // red
        ["dim"]     = new SolidColorBrush(Color.FromRgb(0x6b, 0x72, 0x80)),  // gray
        ["text"]    = new SolidColorBrush(Color.FromRgb(0xf0, 0xf0, 0xf0)),  // white
    };

    public MainWindow()
    {
        InitializeComponent();
        BuildStepList();
        ShowPage(0);
    }

    // ── Step sidebar ─────────────────────────────────────────────────────────

    private void BuildStepList()
    {
        StepPanel.Children.Clear();
        for (int i = 0; i < StepNames.Length; i++)
        {
            var tb = new TextBlock
            {
                Text   = (i < _currentStep   ? "✓ " :
                          i == _currentStep  ? "▶ " : "  ") + StepNames[i],
                Style  = i < _currentStep   ? (Style)Resources["StepLabelDone"]   :
                         i == _currentStep  ? (Style)Resources["StepLabelActive"] :
                                              (Style)Resources["StepLabel"],
                Margin = new Thickness(0, 4, 0, 4),
            };
            StepPanel.Children.Add(tb);
        }
    }

    // ── Page navigation ───────────────────────────────────────────────────────

    private void ShowPage(int step)
    {
        _currentStep = step;
        BuildStepList();

        PageWelcome.Visibility   = step == 0 ? Visibility.Visible : Visibility.Collapsed;
        PageConfig.Visibility    = step == 1 ? Visibility.Visible : Visibility.Collapsed;
        PageInstalling.Visibility = step == 2 ? Visibility.Visible : Visibility.Collapsed;
        PageSuccess.Visibility   = step == 3 ? Visibility.Visible : Visibility.Collapsed;
        PageError.Visibility     = Visibility.Collapsed;

        HeaderTitle.Text = step switch
        {
            0 => "Welcome to Breach Tower",
            1 => "Configuration",
            2 => "Installing...",
            3 => "Installation Complete",
            _ => "Breach Tower Installer",
        };
    }

    private void ShowError(string message)
    {
        Dispatcher.Invoke(() =>
        {
            PageWelcome.Visibility    = Visibility.Collapsed;
            PageConfig.Visibility     = Visibility.Collapsed;
            PageInstalling.Visibility = Visibility.Collapsed;
            PageSuccess.Visibility    = Visibility.Collapsed;
            PageError.Visibility      = Visibility.Visible;
            LblErrorMsg.Text          = message;
            HeaderTitle.Text          = "Installation Failed";
            BuildStepList();
        });
    }

    // ── Logging ───────────────────────────────────────────────────────────────

    private void AppendLog(string message, string colour = "info")
    {
        Dispatcher.Invoke(() =>
        {
            var brush = Colours.TryGetValue(colour, out var b) ? b : Colours["text"];

            // Prefix icon
            string prefix = colour switch
            {
                "success" => "[+] ",
                "warn"    => "[!] ",
                "error"   => "[-] ",
                "dim"     => "    ",
                _         => "[*] ",
            };

            var run = new Run(prefix + message + "\n") { Foreground = brush };
            LogOutput.Inlines.Add(run);

            // Auto-scroll to bottom
            LogScroller.ScrollToEnd();
        });
    }

    private void UpdateProgress(int percent, string label)
    {
        Dispatcher.Invoke(() =>
        {
            MainProgress.Value   = percent;
            LblProgressText.Text = label;
            LblProgressPct.Text  = $"{percent}%";
            LblCurrentStep.Text  = label;
        });
    }

    // ── Button handlers ───────────────────────────────────────────────────────

    private void BtnInstall_Click(object sender, RoutedEventArgs e)
    {
        // Check if already installed
        if (File.Exists(Path.Combine(InstallerEngine.InstallDir, ".env")))
        {
            var result = MessageBox.Show(
                "Breach Tower is already installed at C:\\breach-tower.\n\n" +
                "Overwrite the existing configuration and reinstall?",
                "Already Installed",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (result != MessageBoxResult.Yes) return;
        }
        ShowPage(1);
    }

    private async void BtnUpdate_Click(object sender, RoutedEventArgs e)
    {
        ShowPage(2);
        LogOutput.Inlines.Clear();
        _cts = new CancellationTokenSource();

        var engine = new InstallerEngine(AppendLog, UpdateProgress);
        try
        {
            await engine.UpdateAsync(_cts.Token);
            ShowSuccess();
        }
        catch (OperationCanceledException)
        {
            ShowError("Update cancelled.");
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
    }

    private void BtnUninstall_Click(object sender, RoutedEventArgs e)
    {
        if (!Directory.Exists(InstallerEngine.InstallDir))
        {
            MessageBox.Show("Breach Tower does not appear to be installed.",
                "Not Found", MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        var confirm = MessageBox.Show(
            "This will stop all containers and permanently delete C:\\breach-tower,\n" +
            "including your database.\n\nAre you sure?",
            "Confirm Uninstall",
            MessageBoxButton.YesNo,
            MessageBoxImage.Warning);
        if (confirm != MessageBoxResult.Yes) return;

        ShowPage(2);
        LogOutput.Inlines.Clear();
        UpdateProgress(0, "Uninstalling...");

        Task.Run(() =>
        {
            try
            {
                var engine = new InstallerEngine(AppendLog, UpdateProgress);
                engine.Uninstall();
                Dispatcher.Invoke(() =>
                {
                    MessageBox.Show("Breach Tower has been uninstalled.",
                        "Done", MessageBoxButton.OK, MessageBoxImage.Information);
                    ShowPage(0);
                    UpdateProgress(0, "");
                });
            }
            catch (Exception ex)
            {
                ShowError("Uninstall failed: " + ex.Message);
            }
        });
    }

    private async void BtnStartInstall_Click(object sender, RoutedEventArgs e)
    {
        // Build config from form
        var cfg = new EnvConfig
        {
            AlertEmail   = TxtAlertEmail.Text.Trim(),
            SmtpHost     = TxtSmtpHost.Text.Trim(),
            SmtpPort     = string.IsNullOrWhiteSpace(TxtSmtpPort.Text) ? "587" : TxtSmtpPort.Text.Trim(),
            SmtpUser     = TxtSmtpUser.Text.Trim(),
            SmtpPass     = PwdSmtp.Password,
            SlackWebhook = TxtSlack.Text.Trim(),
            DashboardUrl = string.IsNullOrWhiteSpace(TxtDashUrl.Text)
                           ? "http://localhost:3000" : TxtDashUrl.Text.Trim(),
            FreshEnv     = true,
        };
        SecretGenerator.Populate(cfg);
        _dashboardUrl = cfg.DashboardUrl;

        ShowPage(2);
        LogOutput.Inlines.Clear();
        _cts = new CancellationTokenSource();

        var engine = new InstallerEngine(AppendLog, UpdateProgress);
        try
        {
            await engine.InstallAsync(cfg, _cts.Token);
            ShowSuccess();
        }
        catch (RestartRequiredException ex)
        {
            ShowError(ex.Message);
        }
        catch (OperationCanceledException)
        {
            ShowError("Installation cancelled.");
        }
        catch (Exception ex)
        {
            ShowError(ex.Message);
        }
    }

    // ── Success page ──────────────────────────────────────────────────────────

    private void ShowSuccess()
    {
        Dispatcher.Invoke(() =>
        {
            LblDashUrl.Text = _dashboardUrl;
            ShowPage(3);
            UpdateProgress(100, "Installation complete");
        });
    }

    private void OpenDashboard(object sender, System.Windows.Input.MouseButtonEventArgs e)
        => LaunchUrl(_dashboardUrl);

    private void OpenApiDocs(object sender, System.Windows.Input.MouseButtonEventArgs e)
        => LaunchUrl("http://localhost:8000/docs");

    private void OpenDashboardBtn_Click(object sender, RoutedEventArgs e)
        => LaunchUrl(_dashboardUrl);

    private void CloseBtn_Click(object sender, RoutedEventArgs e)
        => Application.Current.Shutdown();

    private void ErrorBack_Click(object sender, RoutedEventArgs e)
    {
        ShowPage(0);
        UpdateProgress(0, "");
    }

    private static void LaunchUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { /* ignore */ }
    }
}
