using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.CodeAnalysis;

namespace Panopticode.CSharp;

public sealed class Report
{
    public int SchemaVersion { get; init; } = 1;
    public string Language { get; init; } = "csharp";
    public required string Name { get; init; }
    public DateTimeOffset GeneratedAt { get; init; } = DateTimeOffset.UtcNow;
    public string Scope { get; set; } = "Source inventory; project-dependent passes use evaluated Compile items.";
    public List<SourceFile> Files { get; } = [];
    public List<string> Warnings { get; } = [];
    public List<AnalyzerRun> Analyzers { get; } = [];
    public List<Duplicate>? Duplicates { get; set; }
    public List<ProjectMetric> ProjectMetrics { get; } = [];
    public Dictionary<string, string> Definitions { get; } = new()
    {
        ["Size"] = "Physical lines and executable statement syntax nodes, plus one statement per expression-bodied callable or field/property initializer. Blocks, empty statements and local-function declarations are excluded. Nested callable bodies belong to their own region. Abstract methods and auto-accessors are declarations, not executable regions. Declaration-only files remain visible.",
        ["Complexity"] = "Roslyn syntax CCN: 1 per callable or top-level region, plus if, for, foreach, while, do, catch, ?:, non-default switch case/arm, &&, ||, ??, ??= and and/or patterns. Else adds no branch. Independent of Microsoft Metrics; values are not interchangeable.",
        ["Nesting"] = "Maximum control-statement nesting within each region, excluding nested callables. Else-if is nested syntax. Lambda and local-function bodies are independent regions.",
        ["Microsoft Metrics"] = "Separate source-based Microsoft.CodeAnalysis.Metrics XML evidence: cyclomatic complexity, source/executable lines, class coupling and inheritance depth when available. Maintainability index is omitted. No aggregate health score.",
        ["Findings"] = "Compiler errors/warnings and a versioned selection of Microsoft and Meziantou correctness, reliability and security rules. Findings are review prompts, not proof of exploitable vulnerabilities. No style fixes or automatic deletion.",
        ["Coverage"] = "Distinct source lines with runtime hits from Cobertura, or dotCover DetailedXML statement ranges. Missing files remain unknown; partial imports never imply whole-project coverage. Branch coverage is not normalized.",
        ["Duplication"] = "Exact Roslyn token text matches, ignoring whitespace/comments and preserving identifiers/literals. Minimum 50 tokens and 5 source lines in each range; same-file overlapping copies excluded. Representative matches connect repeated occurrences without enumerating every pair. Overlapping duplicated lines counted once. Inactive preprocessor code excluded.",
        ["Scope"] = "Source inventory excludes dependency/build/output directories, symlinks, *.g.cs, *.g.i.cs, *.designer.cs and files with an auto-generated header. Tests and migrations are included. Syntax inventory may include files outside project Compile items. Active preprocessor branches use --define symbols; default DEBUG;TRACE. Semantic passes use project build settings."
    };
}

public sealed class SourceFile
{
    public required string Path { get; init; }
    public required int PhysicalLines { get; init; }
    public List<Region> Regions { get; } = [];
    public List<TypeShape> Types { get; } = [];
    public List<Finding>? Findings { get; set; }
    public Coverage? Coverage { get; set; }
    public int? DuplicatedLines { get; set; }
    public bool Parsed { get; set; } = true;
    [JsonIgnore] public SyntaxTree? Tree { get; set; }
}

public sealed record Region(string Id, string Name, string Kind, int Line, int EndLine,
    int Statements, int Complexity, int MaxNesting, int? Parameters);
public sealed record TypeShape(string Name, string Kind, int Line, int Methods, int Properties, string[] Bases);
public sealed record Finding(string Tool, string Rule, string Severity, string Message, int? Line, int? Column, string? Help = null);
public sealed record Coverage(int Covered, int Total, int[] CoveredLines, int[] ExecutableLines);
public sealed record SourceRange(string File, int Line, int EndLine);
public sealed record Duplicate(SourceRange First, SourceRange Second, int Tokens);
public sealed record ProjectMetric(string Project, string Kind, string Name, string? File, int? Line, Dictionary<string, double> Values);
public sealed record AnalyzerRun(string Id, string Version, string Status, int Files, long DurationMs, string Detail);

public static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = true,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };
}
