using System.Text.Json;
using Microsoft.CodeAnalysis;

namespace Panopticode.CSharp;

public static class Duplication
{
    private sealed record Token(string Text, int Line, int EndLine);
    private sealed record Position(int File, int Offset);
    private const int MinimumTokens = 50;
    private const int MinimumLines = 5;

    public static void Analyze(Report report, CancellationToken cancellation)
    {
        if (report.Files.Any(f => !f.Parsed)) throw new InvalidOperationException("Duplication requires all scoped files to parse; no partial clean result is reported.");
        var tokens = report.Files.Select(f => f.Tree!.GetRoot(cancellation).DescendantTokens()
            .Where(t => !string.IsNullOrEmpty(t.Text))
            .Select(t => new Token(t.Text, t.GetLocation().GetLineSpan().StartLinePosition.Line + 1, t.GetLocation().GetLineSpan().EndLinePosition.Line + 1)).ToArray()).ToArray();
        var windows = new Dictionary<ulong, List<Position>>();
        var matches = new List<(int A, int B, int StartA, int StartB, int Length)>();
        var frontiers = new Dictionary<(int A, int B, int Delta), int>();
        var comparisons = 0;
        ulong power = 1;
        for (var n = 1; n < MinimumTokens; n++) power = unchecked(power * 1099511628211UL);
        for (var file = 0; file < tokens.Length; file++)
        {
            var stream = tokens[file];
            ulong hash = 0;
            for (var end = 0; end < stream.Length; end++)
            {
                cancellation.ThrowIfCancellationRequested();
                if (end >= MinimumTokens) hash = unchecked(hash - Hash(stream[end - MinimumTokens].Text) * power);
                hash = unchecked(hash * 1099511628211UL + Hash(stream[end].Text));
                if (end + 1 < MinimumTokens) continue;
                var start = end - MinimumTokens + 1;
                if (!windows.TryGetValue(hash, out var positions)) windows[hash] = positions = [];
                var matchedSeed = false;
                var needsRepresentative = false;
                foreach (var previous in positions)
                {
                    if (++comparisons > 5_000_000) throw new InvalidOperationException("Duplication exceeded 5 million candidate comparisons. Narrow scope explicitly; no truncated result is accepted.");
                    var other = tokens[previous.File];
                    var offset = previous.Offset;
                    if (!Enumerable.Range(0, MinimumTokens).All(i => other[offset + i].Text == stream[start + i].Text)) continue;
                    matchedSeed = true;
                    if (previous.File == file && start - offset < MinimumTokens) continue;
                    var key = (previous.File, file, start - offset);
                    if (frontiers.GetValueOrDefault(key) >= start + MinimumTokens) continue;
                    var length = MinimumTokens;
                    while (offset + length < other.Length && start + length < stream.Length && other[offset + length].Text == stream[start + length].Text
                           && (previous.File != file || offset + length < start)) length++;
                    if (other[offset + length - 1].EndLine - other[offset].Line + 1 < MinimumLines || stream[start + length - 1].EndLine - stream[start].Line + 1 < MinimumLines)
                    {
                        // Retain a differently laid-out occurrence if the first was too compact.
                        if (stream[end].EndLine - stream[start].Line + 1 >= MinimumLines && other[offset + MinimumTokens - 1].EndLine - other[offset].Line + 1 < MinimumLines) needsRepresentative = true;
                        continue;
                    }
                    matches.Add((previous.File, file, offset, start, length));
                    frontiers[key] = start + length;
                    if (matches.Count > 100_000) throw new InvalidOperationException("Duplication exceeded 100,000 block pairs. Narrow scope explicitly.");
                }
                // A representative per exact seed avoids quadratic all-pairs output for common boilerplate.
                if (!matchedSeed || needsRepresentative) positions.Add(new(file, start));
            }
        }
        report.Duplicates = matches.Select(m => new Duplicate(
            new(report.Files[m.A].Path, tokens[m.A][m.StartA].Line, tokens[m.A][m.StartA + m.Length - 1].EndLine),
            new(report.Files[m.B].Path, tokens[m.B][m.StartB].Line, tokens[m.B][m.StartB + m.Length - 1].EndLine), m.Length)).Distinct().ToList();
        ApplyLines(report);
    }

    private static ulong Hash(string text)
    {
        ulong value = 14695981039346656037UL;
        foreach (var c in text) value = unchecked((value ^ c) * 1099511628211UL);
        return value;
    }

    public static void Import(string path, Report report)
    {
        var blocks = JsonSerializer.Deserialize<List<Duplicate>>(File.ReadAllText(path), Json.Options) ?? throw new InvalidDataException("Expected duplicate block array.");
        var files = report.Files.ToDictionary(f => f.Path);
        foreach (var block in blocks)
        {
            if (block.First is null || block.Second is null || block.Tokens < MinimumTokens) throw new InvalidDataException("Invalid duplicate block.");
            foreach (var range in new[] { block.First, block.Second })
                if (!files.TryGetValue(range.File, out var file) || range.Line < 1 || range.EndLine - range.Line + 1 < MinimumLines || range.EndLine > file.PhysicalLines)
                    throw new InvalidDataException("Duplicate range does not match source inventory.");
            if (block.First.File == block.Second.File && block.First.Line < block.Second.EndLine && block.Second.Line < block.First.EndLine)
                throw new InvalidDataException("Same-file duplicate ranges must not overlap.");
        }
        report.Duplicates = blocks;
        ApplyLines(report);
    }
    private static void ApplyLines(Report report)
    {
        var lines = report.Files.ToDictionary(f => f.Path, _ => new HashSet<int>());
        foreach (var block in report.Duplicates!)
            foreach (var range in new[] { block.First, block.Second })
                lines[range.File].UnionWith(Enumerable.Range(range.Line, range.EndLine - range.Line + 1));
        foreach (var file in report.Files) file.DuplicatedLines = lines[file.Path].Count;
    }
}
