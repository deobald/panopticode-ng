using Panopticode.CSharp;

if (args.Length == 1 && args[0] is "--help" or "-h")
{
    Console.WriteLine("""
    Panopticode C# — offline code health and hardening evidence
    panopticode-csharp TARGET [options]
      TARGET                 Directory, .sln, .slnx or .csproj
      --out DIR              Output directory (default reports/csharp)
      --project FILE         Explicit project/solution, relative to target
      --name NAME            Report name
      --exclude DIR          Exclude relative directory (repeatable)
      --define SYMBOLS       Syntax preprocessor symbols, separated by ; (DEBUG;TRACE)
      --framework TFM        Semantic/test target framework
      --profile MODE         baseline (default) or project diagnostic policy
      --config FILE          Configuration (default target/panopticode.config.json)
      --timeout SECONDS      Timeout per pass/command (default 300)
      --sarif FILE           Import SARIF 2.1.0 diagnostics
      --metrics FILE         Import Microsoft Metrics XML
      --coverage FILE        Import Cobertura or dotCover DetailedXML
      --duplication FILE     Import duplicate array from this package's report.json
      --no-diagnostics       Skip semantic correctness/security analysis
      --no-metrics           Skip Microsoft semantic metrics (syntax still runs)
      --no-coverage          Skip test execution and coverage
      --no-duplication       Skip token duplication analysis
    Imports and --config resolve against the invoking directory; --no-* overrides imports.
    All passes run by default. Restore target dependencies before semantic analysis.
    Coverage executes target tests. No fixes, formatting or deletion runs.
    Exit codes: 0 completed (findings allowed), 1 failed evidence pass, 2 setup/CLI error.
    """);
    return 0;
}
try
{
    var options = Options.Parse(args);
    var report = await Pipeline.Analyze(options);
    var findings = report.Files.All(f => f.Findings is null) ? "diagnostic findings unknown" : $"{report.Files.Sum(f => f.Findings?.Count ?? 0)} available findings (check pass status)";
    Console.WriteLine($"{report.Files.Count} C# files, {report.Files.Sum(f => f.Regions.Count)} regions; {findings}.");
    Console.WriteLine(Path.Combine(options.Output, "report.html"));
    return report.Analyzers.Any(a => a.Status == "failed") ? 1 : 0;
}
catch (Exception error) when (error is not OutOfMemoryException)
{
    Console.Error.WriteLine(error.Message);
    return 2;
}
