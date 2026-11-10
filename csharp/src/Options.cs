using System.Text.Json;

namespace Panopticode.CSharp;

public sealed class Options
{
    public required string Root { get; init; }
    public string Output { get; set; } = Path.GetFullPath("reports/csharp");
    public string? Project { get; set; }
    public string? Name { get; set; }
    public string Profile { get; set; } = "baseline";
    public string? Framework { get; set; }
    public string[] Defines { get; set; } = ["DEBUG", "TRACE"];
    public HashSet<string> Disabled { get; } = [];
    public Dictionary<string, string> Imports { get; } = [];
    public List<string> Excludes { get; } = [];
    public int Timeout { get; set; } = 300;
    public Configuration Config { get; set; } = new();

    public static Options Parse(string[] args)
    {
        if (args.Length == 0 || args[0].StartsWith('-')) throw new ArgumentException("A target directory, .sln, .slnx or .csproj is required. Use --help.");
        var target = Path.GetFullPath(args[0]);
        if (!Directory.Exists(target) && !File.Exists(target)) throw new ArgumentException("Target does not exist.");
        if (File.Exists(target) && !new[] { ".sln", ".slnx", ".csproj" }.Contains(Path.GetExtension(target)))
            throw new ArgumentException("Target file must be .sln, .slnx or .csproj.");
        var result = new Options { Root = Directory.Exists(target) ? target : Path.GetDirectoryName(target)! };
        if (File.Exists(target)) result.Project = target;
        string? config = null;
        for (var i = 1; i < args.Length; i++)
        {
            var flag = args[i];
            if (flag.StartsWith("--no-"))
            {
                var pass = flag[5..];
                if (!new[] { "diagnostics", "metrics", "coverage", "duplication" }.Contains(pass)) throw new ArgumentException($"Unknown option {flag}");
                result.Disabled.Add(pass);
                continue;
            }
            if (++i >= args.Length) throw new ArgumentException($"Missing value for {flag}");
            var value = args[i];
            switch (flag)
            {
                case "--out": result.Output = Path.GetFullPath(value); break;
                case "--name": result.Name = value; break;
                case "--project": result.Project = Path.GetFullPath(value, result.Root); break;
                case "--exclude": result.Excludes.Add(value.Replace('\\', '/').Trim('/')); break;
                case "--define": result.Defines = value.Split(';', StringSplitOptions.RemoveEmptyEntries); break;
                case "--framework": result.Framework = value; break;
                case "--profile": result.Profile = value; break;
                case "--config": config = Path.GetFullPath(value); break;
                case "--timeout": result.Timeout = int.Parse(value); break;
                case "--sarif": result.Imports["diagnostics"] = Path.GetFullPath(value); break;
                case "--metrics": result.Imports["metrics"] = Path.GetFullPath(value); break;
                case "--coverage": result.Imports["coverage"] = Path.GetFullPath(value); break;
                case "--duplication": result.Imports["duplication"] = Path.GetFullPath(value); break;
                default: throw new ArgumentException($"Unknown option {flag}");
            }
        }
        if (result.Profile is not ("baseline" or "project")) throw new ArgumentException("Profile must be baseline or project.");
        if (result.Timeout is < 1 or > 86400) throw new ArgumentException("Timeout must be between 1 and 86400 seconds.");
        if (result.Output == result.Root) throw new ArgumentException("Output must differ from target root.");
        config ??= Path.Combine(result.Root, "panopticode.config.json");
        if (File.Exists(config)) result.Config = JsonSerializer.Deserialize<Configuration>(File.ReadAllText(config), Json.Options) ?? throw new ArgumentException("Empty configuration.");
        else if (args.Contains("--config")) throw new ArgumentException("Configuration does not exist.");
        if (result.Config.Version != 1) throw new ArgumentException("Unsupported configuration version.");
        return result;
    }

    public string SelectProject()
    {
        if (Project is not null) return File.Exists(Project) ? Project : throw new InvalidOperationException("Selected project does not exist.");
        foreach (var pattern in new[] { "*.sln", "*.slnx", "*.csproj" })
        {
            var candidates = Directory.GetFiles(Root, pattern);
            if (candidates.Length > 1) throw new InvalidOperationException("Multiple project/solution files; select --project.");
            if (candidates.Length == 1) return candidates[0];
        }
        throw new InvalidOperationException("No root project/solution; select --project. Syntax inventory is still available.");
    }
}

public sealed class Configuration
{
    public int Version { get; set; } = 1;
    public CoverageCommand? Coverage { get; set; }
    public Dictionary<string, string> PathMappings { get; set; } = [];
}
public sealed class CoverageCommand
{
    public string[] Command { get; set; } = [];
    public string[] Reports { get; set; } = [];
}
