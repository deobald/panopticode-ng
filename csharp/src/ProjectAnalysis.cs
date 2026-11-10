extern alias metrics;
using System.Collections.Immutable;
using System.Reflection;
using System.Runtime.Loader;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis;
using CodeAnalysisMetricData = metrics::Microsoft.CodeAnalysis.CodeMetrics.CodeAnalysisMetricData;
using CodeMetricsAnalysisContext = metrics::Microsoft.CodeAnalysis.CodeMetrics.CodeMetricsAnalysisContext;
using Microsoft.CodeAnalysis.Diagnostics;
using Microsoft.CodeAnalysis.MSBuild;

namespace Panopticode.CSharp;

public sealed class ProjectAnalysis : IDisposable
{
    private MSBuildWorkspace? workspace;
    private List<Project>? projects;
    private string? loadError;
    private bool attempted;
    private readonly Options options;
    private readonly Report report;
    public ProjectAnalysis(Options options, Report report) { this.options = options; this.report = report; }

    public async Task Load(CancellationToken cancellation)
    {
        if (attempted)
        {
            if (loadError is not null) throw new InvalidOperationException(loadError);
            return;
        }
        attempted = true;
        try
        {
            var selected = options.SelectProject();
            // Classic web and Framework projects require a matching Windows/VS build environment.
            if (!OperatingSystem.IsWindows() && SourceAnalysis.DiscoverProjectFiles(selected, options.Root).Any(p => File.ReadAllText(p).Contains("<TargetFrameworkVersion>")))
                throw new InvalidOperationException("Legacy .NET Framework projects require Windows reference assemblies and their Visual Studio/MSBuild targets. Use a Windows environment for semantic passes, or import SARIF/Metrics XML. Syntax measurements remain available.");
            if (!MSBuildLocator.IsRegistered) MSBuildLocator.RegisterDefaults();
            var properties = new Dictionary<string, string>();
            if (options.Framework is not null) properties["TargetFramework"] = options.Framework;
            workspace = MSBuildWorkspace.Create(properties);
            if (selected.EndsWith(".csproj", StringComparison.OrdinalIgnoreCase))
                projects = [await workspace.OpenProjectAsync(selected, cancellationToken: cancellation)];
            else projects = (await workspace.OpenSolutionAsync(selected, cancellationToken: cancellation)).Projects.Where(p => p.Language == LanguageNames.CSharp).ToList();
            var failures = workspace.Diagnostics.Where(d => d.Kind == WorkspaceDiagnosticKind.Failure).ToArray();
            if (failures.Length > 0) throw new InvalidOperationException(string.Join("\n", failures.Select(d => d.Message)));
            if (projects.Count == 0) throw new InvalidOperationException("No C# projects loaded.");
            foreach (var project in projects)
                if (project.ParseOptions is Microsoft.CodeAnalysis.CSharp.CSharpParseOptions parse && !parse.PreprocessorSymbolNames.Order().SequenceEqual(options.Defines.Order()))
                    report.Warnings.Add($"{project.Name}: semantic symbols ({string.Join(';', parse.PreprocessorSymbolNames)}) differ from syntax inventory symbols ({string.Join(';', options.Defines)}).");
        }
        catch (Exception error) { loadError = error.Message; throw; }
    }

    // Versioned baseline: approved correctness/security rules, no formatting or naming policy.
    public static readonly ImmutableHashSet<string> Baseline = new[]
    {
        "CA2000", "CA2007", "CA2008", "CA2012", "CA2013", "CA2014", "CA2016", "CA2017", "CA2018", "CA2021", "CA2022", "CA2200", "CA2202",
        "CA3001", "CA3002", "CA3003", "CA3004", "CA3005", "CA3006", "CA3007", "CA3008", "CA3009", "CA3010", "CA3011", "CA3012",
        "CA3075", "CA3147", "CA5350", "CA5351", "CA5359", "CA5360", "CA5361", "CA5362", "CA5363", "CA5364", "CA5365", "CA5366", "CA5367", "CA5368", "CA5369", "CA5370", "CA5371", "CA5372", "CA5373", "CA5375", "CA5376", "CA5377", "CA5378", "CA5379", "CA5380", "CA5381", "CA5382", "CA5383", "CA5384", "CA5385", "CA5386", "CA5387", "CA5388", "CA5389", "CA5390", "CA5391", "CA5392", "CA5393", "CA5394", "CA5395", "CA5396", "CA5397", "CA5398", "CA5399", "CA5400", "CA5401", "CA5402", "CA5403", "CA5404", "CA5405",
        "MA0009", "MA0022", "MA0040", "MA0042", "MA0055", "MA0064", "MA0134"
    }.ToImmutableHashSet();

    public async Task Diagnostics(CancellationToken cancellation)
    {
        await Load(cancellation);
        var loader = new AnalyzerLoader();
        var analyzerPaths = Directory.GetFiles(Path.Combine(AppContext.BaseDirectory, "Analyzers"), "*.dll");
        var references = analyzerPaths.Select(p => new AnalyzerFileReference(p, loader)).ToArray();
        var loadFailures = new List<string>();
        foreach (var reference in references) reference.AnalyzerLoadFailed += (_, e) => loadFailures.Add(e.Message);
        var baselineAnalyzers = references.SelectMany(r => r.GetAnalyzers(LanguageNames.CSharp)).ToImmutableArray();
        if (loadFailures.Count > 0 || baselineAnalyzers.Length == 0) throw new InvalidOperationException("Cannot load bundled analyzers: " + string.Join("; ", loadFailures));
        var staged = new Dictionary<string, List<Finding>>();
        var inventory = report.Files.ToDictionary(f => Path.GetFullPath(f.Path, options.Root));
        var projectFindings = new List<string>();
        var semanticErrors = false;
        foreach (var project in projects!)
        {
            var compilation = await project.GetCompilationAsync(cancellation) ?? throw new InvalidOperationException($"Cannot compile {project.Name}");
            var analyzers = options.Profile == "project" ? baselineAnalyzers.AddRange(project.AnalyzerReferences.SelectMany(r => r.GetAnalyzers(LanguageNames.CSharp))) : baselineAnalyzers;
            if (options.Profile == "baseline")
            {
                var rules = analyzers.SelectMany(a => a.SupportedDiagnostics).DistinctBy(d => d.Id)
                    .ToImmutableDictionary(d => d.Id, d => Baseline.Contains(d.Id) ? ReportDiagnostic.Warn : ReportDiagnostic.Suppress);
                compilation = compilation.WithOptions(compilation.Options.WithSpecificDiagnosticOptions(rules).WithGeneralDiagnosticOption(ReportDiagnostic.Default).WithSyntaxTreeOptionsProvider(null));
            }
            foreach (var tree in compilation.SyntaxTrees)
                if (inventory.ContainsKey(tree.FilePath)) staged.TryAdd(tree.FilePath, []);
            var failures = new List<string>();
            var analyzerOptions = options.Profile == "project" ? project.AnalyzerOptions : new AnalyzerOptions([]);
            var runOptions = new CompilationWithAnalyzersOptions(analyzerOptions, (e, a, _) => { lock (failures) failures.Add($"{a.GetType().Name}: {e.Message}"); }, concurrentAnalysis: true, logAnalyzerExecutionTime: false, reportSuppressedDiagnostics: false);
            var diagnostics = await compilation.WithAnalyzers(analyzers, runOptions).GetAllDiagnosticsAsync(cancellation);
            if (failures.Count > 0) throw new InvalidOperationException("Analyzer failures: " + string.Join("; ", failures.Distinct()));
            foreach (var d in diagnostics.Where(d => d.Severity is DiagnosticSeverity.Warning or DiagnosticSeverity.Error && !d.IsSuppressed))
            {
                if (d.Severity == DiagnosticSeverity.Error && d.Id.StartsWith("CS")) semanticErrors = true;
                var span = d.Location.GetLineSpan();
                if (!staged.TryGetValue(span.Path, out var list))
                {
                    if (d.Location == Location.None) projectFindings.Add($"{project.Name}: {d.Id} {d.GetMessage()}");
                    continue;
                }
                list.Add(new(d.Id.StartsWith("CA") ? "Microsoft.NetAnalyzers" : d.Id.StartsWith("MA") ? "Meziantou.Analyzer" : "Roslyn/project", d.Id, d.Severity == DiagnosticSeverity.Error ? "error" : "warning", d.GetMessage(), span.StartLinePosition.Line + 1, span.StartLinePosition.Character + 1, d.Descriptor.HelpLinkUri));
            }
        }
        foreach (var (path, findings) in staged) inventory[path].Findings = findings.Distinct().OrderBy(f => f.Line).ThenBy(f => f.Rule).ToList();
        report.Warnings.AddRange(projectFindings.Distinct());
        if (semanticErrors) throw new InvalidOperationException("Compiler errors were found. Available findings are retained; semantic analysis is incomplete until the target compiles.");
        var outside = report.Files.Count(f => f.Findings is null);
        if (outside > 0) report.Warnings.Add($"{outside} inventory files are outside evaluated project scope; their diagnostics remain unknown.");
    }

    public async Task Metrics(CancellationToken cancellation)
    {
        await Load(cancellation);
        var staged = new List<ProjectMetric>();
        foreach (var project in projects!)
        {
            var compilation = await project.GetCompilationAsync(cancellation) ?? throw new InvalidOperationException($"Cannot compile {project.Name}");
            if (compilation.GetDiagnostics(cancellation).Any(d => d.Severity == DiagnosticSeverity.Error))
                throw new InvalidOperationException($"{project.Name} has compiler errors; semantic metrics are unavailable. Syntax metrics remain separate.");
            var metrics = await CodeAnalysisMetricData.ComputeAsync(new CodeMetricsAnalysisContext(compilation, cancellation));
            void Visit(CodeAnalysisMetricData data)
            {
                var location = data.Symbol.Locations.FirstOrDefault(l => l.IsInSource);
                var file = location?.SourceTree?.FilePath;
                if (file is not null && report.Files.Any(f => Path.GetFullPath(f.Path, options.Root) == file))
                {
                    var values = new Dictionary<string, double> { ["SourceLines"] = data.SourceLines, ["ExecutableLines"] = data.ExecutableLines, ["CyclomaticComplexity"] = data.CyclomaticComplexity, ["ClassCoupling"] = data.CoupledNamedTypes.Count };
                    if (data.DepthOfInheritance is int depth) values["DepthOfInheritance"] = depth;
                    staged.Add(new(project.Name, data.Symbol.Kind.ToString(), data.Symbol.ToDisplayString(), Path.GetRelativePath(options.Root, file).Replace('\\', '/'), location!.GetLineSpan().StartLinePosition.Line + 1, values));
                }
                foreach (var child in data.Children) Visit(child);
            }
            Visit(metrics);
        }
        report.ProjectMetrics.AddRange(staged);
    }
    public void Dispose() => workspace?.Dispose();
}

internal sealed class AnalyzerLoader : IAnalyzerAssemblyLoader
{
    public void AddDependencyLocation(string fullPath) { }
    public Assembly LoadFromPath(string fullPath) => AssemblyLoadContext.Default.LoadFromAssemblyPath(fullPath);
}
