using System.Globalization;
using System.Text.Json;
using System.Xml;
using System.Xml.Linq;

namespace Panopticode.CSharp;

public sealed class Imports(Options options, Report report)
{
    private readonly Dictionary<string, SourceFile> files = report.Files.ToDictionary(f => f.Path, StringComparer.Ordinal);

    public SourceFile? Resolve(string value, IEnumerable<string>? roots = null)
    {
        value = Uri.UnescapeDataString(value).Replace('\\', '/');
        if (Uri.TryCreate(value, UriKind.Absolute, out var uri) && uri.IsFile) value = uri.LocalPath.Replace('\\', '/');
        foreach (var (from, to) in options.Config.PathMappings.OrderByDescending(p => p.Key.Length))
        {
            var prefix = from.Replace('\\', '/').TrimEnd('/');
            if (value == prefix || value.StartsWith(prefix + "/", StringComparison.Ordinal))
            {
                value = Path.Combine(Path.GetFullPath(to, options.Root), value[prefix.Length..].TrimStart('/'));
                break;
            }
        }
        foreach (var root in new[] { options.Root }.Concat(roots ?? []))
        {
            try
            {
                var full = Path.GetFullPath(value, Path.GetFullPath(root, options.Root));
                var relative = Path.GetRelativePath(options.Root, full).Replace('\\', '/');
                if (files.TryGetValue(relative, out var file)) return file;
            }
            catch (ArgumentException) { }
        }
        return null;
    }

    private static XDocument Xml(string path)
    {
        using var reader = XmlReader.Create(path, new XmlReaderSettings { DtdProcessing = DtdProcessing.Ignore, XmlResolver = null, MaxCharactersInDocument = 100_000_000 });
        return XDocument.Load(reader);
    }
    private static int Number(XElement node, string attribute, int min = 0)
    {
        if (!int.TryParse((string?)node.Attribute(attribute), NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) || value < min)
            throw new InvalidDataException($"Invalid {node.Name}.{attribute}");
        return value;
    }

    public void Coverage(IEnumerable<string> paths)
    {
        var totals = new Dictionary<string, SortedDictionary<int, bool>>();
        var unknown = new HashSet<string>();
        void Add(string source, int start, int end, bool covered, IEnumerable<string>? roots = null)
        {
            var file = Resolve(source, roots);
            if (file is null) { unknown.Add(source); return; }
            if (start < 1 || end < start || end > file.PhysicalLines) throw new InvalidDataException($"Coverage lines outside {file.Path}; evidence may be from a different revision.");
            if (!totals.TryGetValue(file.Path, out var lines)) totals[file.Path] = lines = [];
            for (var line = start; line <= end; line++) lines[line] = lines.GetValueOrDefault(line) || covered;
        }
        foreach (var path in paths)
        {
            var document = Xml(path);
            var root = document.Root ?? throw new InvalidDataException("Empty coverage XML.");
            if (root.Name.LocalName == "coverage")
            {
                var roots = root.Descendants("source").Select(s => s.Value).ToArray();
                foreach (var type in root.Descendants("class"))
                {
                    var source = (string?)type.Attribute("filename") ?? throw new InvalidDataException("Cobertura class requires filename.");
                    // Read class-level lines, not repeated method-level line lists.
                    foreach (var line in type.Element("lines")?.Elements("line") ?? [])
                    {
                        var number = Number(line, "number", 1);
                        Add(source, number, number, Number(line, "hits") > 0, roots);
                    }
                }
            }
            else if (root.Name.LocalName == "Root")
            {
                var index = root.Descendants("File").Where(f => f.Attribute("Index") is not null && f.Attribute("Name") is not null)
                    .ToDictionary(f => Number(f, "Index"), f => (string)f.Attribute("Name")!);
                var statements = root.Descendants("Statement").ToArray();
                if (statements.Length == 0) throw new InvalidDataException("dotCover requires DetailedXML with Statement locations, not summary XML.");
                foreach (var statement in statements)
                {
                    if (!index.TryGetValue(Number(statement, "FileIndex"), out var source)) throw new InvalidDataException("Unknown dotCover FileIndex.");
                    if (!bool.TryParse((string?)statement.Attribute("Covered"), out var covered)) throw new InvalidDataException("Invalid dotCover Covered value.");
                    Add(source, Number(statement, "Line", 1), Number(statement, "EndLine", 1), covered);
                }
            }
            else throw new InvalidDataException("Expected Cobertura coverage or dotCover DetailedXML Root.");
        }
        if (totals.Count == 0) throw new InvalidDataException("Coverage contains no matching executable lines. Check pathMappings and source revision.");
        foreach (var (path, lines) in totals)
        {
            var covered = lines.Where(p => p.Value).Select(p => p.Key).ToArray();
            files[path].Coverage = new(covered.Length, lines.Count, covered, lines.Keys.ToArray());
        }
        if (unknown.Count > 0) report.Warnings.Add($"Coverage: {unknown.Count} source paths did not match the inventory. Configure pathMappings for reports from another checkout.");
    }

    public void Sarif(string path)
    {
        using var document = JsonDocument.Parse(File.ReadAllText(path));
        var root = document.RootElement;
        if (root.GetProperty("version").GetString() != "2.1.0") throw new InvalidDataException("Expected SARIF 2.1.0.");
        var staged = new Dictionary<string, List<Finding>>();
        foreach (var run in root.GetProperty("runs").EnumerateArray())
        {
            if (run.TryGetProperty("invocations", out var invocations) && invocations.EnumerateArray().Any(i => i.TryGetProperty("executionSuccessful", out var ok) && !ok.GetBoolean()))
                throw new InvalidDataException("SARIF producer reported unsuccessful execution.");
            var artifacts = run.TryGetProperty("artifacts", out var artifactList) ? artifactList.EnumerateArray().ToArray() : [];
            string Source(JsonElement location)
            {
                if (location.TryGetProperty("index", out var index) && !location.TryGetProperty("uri", out _)) location = artifacts[index.GetInt32()].GetProperty("location");
                var value = location.GetProperty("uri").GetString() ?? "";
                if (location.TryGetProperty("uriBaseId", out var id) && run.TryGetProperty("originalUriBaseIds", out var bases) && bases.TryGetProperty(id.GetString()!, out var baseLocation))
                {
                    var baseUri = baseLocation.GetProperty("uri").GetString()!;
                    value = Uri.TryCreate(baseUri, UriKind.Absolute, out var absolute) ? new Uri(absolute, value).ToString() : baseUri.TrimEnd('/', '\\') + "/" + value;
                }
                return value;
            }
            foreach (var artifact in artifacts)
                if (artifact.TryGetProperty("location", out var location) && Resolve(Source(location)) is { } file) staged.TryAdd(file.Path, []);
            var tool = run.GetProperty("tool").GetProperty("driver").GetProperty("name").GetString() ?? "SARIF";
            foreach (var result in run.GetProperty("results").EnumerateArray())
            {
                if (result.TryGetProperty("suppressions", out var suppressions) && suppressions.EnumerateArray().Any(s => !s.TryGetProperty("status", out var status) || status.GetString() == "accepted")) continue;
                if (!result.TryGetProperty("locations", out var locations) || locations.GetArrayLength() == 0)
                { report.Warnings.Add($"{tool}: SARIF finding without a source location: {result.GetProperty("message").GetProperty("text").GetString()}"); continue; }
                var physical = locations[0].GetProperty("physicalLocation");
                var source = Resolve(Source(physical.GetProperty("artifactLocation")));
                if (source is null) continue;
                if (!staged.TryGetValue(source.Path, out var findings)) staged[source.Path] = findings = [];
                var line = physical.TryGetProperty("region", out var region) && region.TryGetProperty("startLine", out var lineValue) ? lineValue.GetInt32() : (int?)null;
                if (line is < 1 || line > source.PhysicalLines) throw new InvalidDataException("SARIF line outside source inventory.");
                findings.Add(new(tool, result.GetProperty("ruleId").GetString() ?? "unknown", result.TryGetProperty("level", out var level) ? level.GetString() ?? "warning" : "warning", result.GetProperty("message").GetProperty("text").GetString() ?? "", line, null));
            }
        }
        foreach (var (pathKey, findings) in staged) files[pathKey].Findings = findings.Distinct().ToList();
        if (staged.Count == 0) report.Warnings.Add("SARIF contained no matched artifacts or findings; diagnostic scope remains unknown.");
    }

    public void Metrics(string path)
    {
        var doc = Xml(path);
        if (doc.Root?.Name.LocalName != "CodeMetricsReport") throw new InvalidDataException("Expected Microsoft CodeMetricsReport XML.");
        var staged = new List<ProjectMetric>();
        var allowed = new HashSet<string> { "SourceLines", "ExecutableLines", "CyclomaticComplexity", "ClassCoupling", "DepthOfInheritance" };
        foreach (var node in doc.Descendants().Where(e => e.Element("Metrics") is not null))
        {
            var values = new Dictionary<string, double>();
            foreach (var metric in node.Element("Metrics")!.Elements("Metric"))
            {
                var name = (string?)metric.Attribute("Name") ?? "";
                if (!allowed.Contains(name)) continue;
                if (!double.TryParse((string?)metric.Attribute("Value"), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) || !double.IsFinite(value) || value < 0) throw new InvalidDataException("Invalid metric value.");
                values[name] = value;
            }
            if (values.Count == 0) continue;
            var source = Resolve((string?)node.Attribute("File") ?? "");
            if (source is null) continue;
            int? line = node.Attribute("Line") is null ? null : Number(node, "Line", 1);
            staged.Add(new((string?)node.Ancestors("Project").FirstOrDefault()?.Attribute("Name") ?? "import", node.Name.LocalName, (string?)node.Attribute("Name") ?? "", source.Path, line, values));
        }
        if (staged.Count == 0) throw new InvalidDataException("Metrics XML contained no source-located, matched measurements.");
        report.ProjectMetrics.AddRange(staged);
    }
}
