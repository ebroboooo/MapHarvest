using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            string exeDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
            DirectoryInfo parent = Directory.GetParent(exeDir);
            string root = parent != null ? parent.FullName : exeDir;
            if (!File.Exists(Path.Combine(root, "package.json")))
            {
                root = @"C:\MapHarvest";
            }

            string script = Path.Combine(root, "scripts", "start-mapharvest.ps1");
            if (!File.Exists(script))
            {
                MessageBox.Show(
                    "Cannot find scripts\\start-mapharvest.ps1 in:\n" + root,
                    "MapHarvest",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = "-NoProfile -ExecutionPolicy Bypass -File \"" + script + "\"",
                WorkingDirectory = root,
                UseShellExecute = true,
                WindowStyle = ProcessWindowStyle.Minimized,
            };
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "MapHarvest", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
