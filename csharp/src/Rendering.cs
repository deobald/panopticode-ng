using System.Net;
using System.Reflection;
using System.Text.Json;

namespace Panopticode.CSharp;

public static class Rendering
{
    private static string Asset(string suffix)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var name = assembly.GetManifestResourceNames().Single(n => n.EndsWith(".Web." + suffix, StringComparison.Ordinal));
        using var reader = new StreamReader(assembly.GetManifestResourceStream(name)!);
        return reader.ReadToEnd();
    }
    public static string Html(Report report)
    {
        var data = JsonSerializer.Serialize(report, Json.Options).Replace("<", "\\u003c").Replace("\u2028", "\\u2028").Replace("\u2029", "\\u2029");
        return Asset("report.html").Replace("{{TITLE}}", WebUtility.HtmlEncode(report.Name))
            .Replace("{{CSS}}", Asset("report.css"))
            .Replace("{{SCRIPT}}", "(() => {\n'use strict';\n" + Asset("treemap.js").Replace("export function partition", "function partition") + "\n" + Asset("report.js") + "\n})();")
            .Replace("{{DATA}}", data);
    }
}
