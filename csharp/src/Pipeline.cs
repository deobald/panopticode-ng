using System.Diagnostics;
using System.Text.Json;
using Microsoft.CodeAnalysis;

namespace Panopticode.CSharp;

public static class Pipeline
{
    public static async Task<Report> Analyze(Options options)
    {
        Directory.CreateDirectory(options.Output);
        var runDirectory = Path.Combine(options.Output, "runs", DateTime.UtcNow.ToString("yyyyMMddTHHmmssfff") + "-" + Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(runDirectory);
        var report = new Report { Name = options.Name ?? Path.GetFileName(options.Root) };
        var stopwatch = Stopwatch.StartNew();
        foreach (var path in SourceAnalysis.Discover(options)) report.Files.Add(SourceAnalysis.Measure(path, options, report));
        if (report.Files.Count == 0) throw new InvalidOperationException("No C# source files found in scope.");
        report.Analyzers.Add(new("syntax", typeof(SyntaxTree).Assembly.GetName().Version?.ToString() ?? "unknown", report.Files.All(f => f.Parsed) ? "complete" : "failed", report.Files.Count, stopwatch.ElapsedMilliseconds, "Roslyn syntax profile v1; symbols=" + string.Join(';', options.Defines)));
        using var project = new ProjectAnalysis(options, report);
        var importer = new Imports(options, report);
        foreach (var pass in new[] { "diagnostics", "metrics", "duplication", "coverage" })
        {
            stopwatch.Restart();
            var version = pass switch { "diagnostics" => "Microsoft.NetAnalyzers 10.0.403; Meziantou 3.0.322; baseline v1", "metrics" => "Microsoft.CodeAnalysis.Metrics 5.6.0", "duplication" => "Roslyn token detector v1", _ => "project Coverlet/configured runner; source versions in raw artifacts" };
            if (options.Disabled.Contains(pass))
            {
                report.Analyzers.Add(new(pass, version, "skipped", 0, 0, "Explicit --no-" + pass));
                continue;
            }
            Console.WriteLine($"Running {pass}…");
            var status = "complete";
            var detail = pass == "diagnostics" ? "Profile: " + options.Profile + "; selected rules are recorded in the package README." : "See metric definitions and report scope.";
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(options.Timeout));
            try
            {
                if (options.Imports.TryGetValue(pass, out var path))
                {
                    switch (pass)
                    {
                        case "diagnostics": importer.Sarif(path); break;
                        case "metrics": importer.Metrics(path); break;
                        case "duplication": Duplication.Import(path, report); break;
                        case "coverage": importer.Coverage([path]); break;
                    }
                    status = "imported";
                    detail = $"Imported {Path.GetFileName(path)}; producer version/freshness unverified. Check source revision. " + detail;
                    // Preserve exact imported evidence for inspection; no target source is copied.
                    File.Copy(path, Path.Combine(runDirectory, pass + Path.GetExtension(path)), overwrite: false);
                    version = "unspecified (import)";
                }
                else
                {
                    switch (pass)
                    {
                        case "diagnostics": await project.Diagnostics(timeout.Token); break;
                        case "metrics": await project.Metrics(timeout.Token); break;
                        case "duplication": Duplication.Analyze(report, timeout.Token); break;
                        case "coverage": await Commands.Coverage(options, report, runDirectory, timeout.Token); break;
                    }
                }
            }
            catch (Exception error)
            {
                status = "failed";
                detail = error is OperationCanceledException ? $"Pass exceeded {options.Timeout} seconds." : error.Message;
                await File.WriteAllTextAsync(Path.Combine(runDirectory, pass + "-error.txt"), error.ToString());
                Console.Error.WriteLine($"{pass}: {detail}");
            }
            var count = pass switch
            {
                "diagnostics" => report.Files.Count(f => f.Findings is not null),
                "coverage" => report.Files.Count(f => f.Coverage is not null),
                "metrics" => report.ProjectMetrics.Select(m => m.File).Distinct().Count(),
                _ => report.Files.Count(f => f.DuplicatedLines is not null)
            };
            report.Analyzers.Add(new(pass, version, status, count, stopwatch.ElapsedMilliseconds, detail));
        }
        await File.WriteAllTextAsync(Path.Combine(options.Output, "report.json"), JsonSerializer.Serialize(report, Json.Options));
        await File.WriteAllTextAsync(Path.Combine(options.Output, "report.html"), Rendering.Html(report));
        return report;
    }
}
