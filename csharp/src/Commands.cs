using System.Diagnostics;
using System.Security.Cryptography;
using System.Xml.Linq;

namespace Panopticode.CSharp;

public static class Commands
{
    public static async Task Run(string[] command, string cwd, string log, CancellationToken cancellation)
    {
        if (command.Length == 0 || string.IsNullOrWhiteSpace(command[0])) throw new InvalidOperationException("Command must be a nonempty argument array.");
        var start = new ProcessStartInfo(command[0]) { WorkingDirectory = cwd, UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
        foreach (var arg in command.Skip(1)) start.ArgumentList.Add(arg);
        using var process = Process.Start(start) ?? throw new InvalidOperationException("Cannot start command.");
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        try { await process.WaitForExitAsync(cancellation); }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
            await process.WaitForExitAsync(CancellationToken.None);
            await File.WriteAllTextAsync(log, await stdout + "\n" + await stderr, CancellationToken.None);
            throw;
        }
        await File.WriteAllTextAsync(log, await stdout + "\n" + await stderr, cancellation);
        if (process.ExitCode != 0) throw new InvalidOperationException($"Command exited {process.ExitCode}; see {log}");
    }

    public static async Task Coverage(Options options, Report report, string runDirectory, CancellationToken cancellation)
    {
        var config = options.Config.Coverage;
        string[] reports;
        if (config is not null)
        {
            reports = config.Reports.Select(p => Path.GetFullPath(p, options.Root)).ToArray();
            if (reports.Length == 0) throw new InvalidOperationException("coverage.reports must list expected evidence paths.");
            var before = reports.ToDictionary(p => p, Fingerprint);
            await Run(config.Command, options.Root, Path.Combine(runDirectory, "coverage.log"), cancellation);
            if (reports.Any(p => !File.Exists(p) || before[p] == Fingerprint(p))) throw new InvalidOperationException("Coverage command did not create or change every configured report; stale output was rejected.");
        }
        else
        {
            var selected = options.SelectProject();
            var projectPaths = SourceAnalysis.DiscoverProjectFiles(selected, options.Root).ToArray();
            var documents = projectPaths.Select(XDocument.Load).ToArray();
            if (documents.Any(d => d.Descendants().Any(e => e.Name.LocalName == "TargetFrameworkVersion")))
                throw new InvalidOperationException("Legacy test execution requires its Windows runner. Configure coverage.command/reports or import Cobertura/dotCover DetailedXML. Tests in the source tree are not measured coverage.");
            var references = documents.SelectMany(d => d.Descendants("PackageReference")).Select(p => (string?)p.Attribute("Include") ?? (string?)p.Attribute("Update")).ToHashSet();
            var collector = references.Contains("coverlet.collector");
            var mtp = references.Contains("coverlet.MTP");
            if (collector == mtp) throw new InvalidOperationException("Coverage needs one discoverable Coverlet driver (coverlet.collector or coverlet.MTP), or a configured command/import. Mixed runners need explicit configuration.");
            var output = Path.Combine(runDirectory, "coverage");
            var command = new List<string> { "dotnet", "test", selected, "--no-restore", "--results-directory", output };
            if (collector) command.AddRange(["--collect", "XPlat Code Coverage"]);
            else command.AddRange(["--coverlet", "--coverlet-output-format", "cobertura"]);
            if (options.Framework is not null) command.AddRange(["--framework", options.Framework]);
            await Run(command.ToArray(), options.Root, Path.Combine(runDirectory, "coverage.log"), cancellation);
            reports = Directory.Exists(output) ? Directory.GetFiles(output, "*.cobertura.xml", SearchOption.AllDirectories) : [];
            if (reports.Length == 0) throw new InvalidOperationException("Tests produced no Cobertura reports.");
        }
        new Imports(options, report).Coverage(reports);
    }
    private static string? Fingerprint(string path) => File.Exists(path) ? Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(path))) : null;
}
