using System.Net.Http;
using System.Text.RegularExpressions;

namespace Demo;

// Deliberate examples for the report, never executed by the analyzer.
public class Example
{
    public static HttpClientHandler UnsafeCertificatePolicy() => new()
    {
        ServerCertificateCustomValidationCallback = (_, _, _, _) => true
    };

    public static bool MatchUntrustedInput(string pattern, string input) => Regex.IsMatch(input, pattern);

    public static byte[] WeakHash(byte[] input)
    {
        using var digest = System.Security.Cryptography.MD5.Create();
        return digest.ComputeHash(input);
    }

    public int Summarize(int[] values)
    {
        var total = 0;
        foreach (var value in values)
        {
            if (value > 10 && value < 100)
            {
                total += value;
                if (value % 2 == 0) total++;
            }
            else if (value < 0) total -= value;
        }
        return total;
    }

    public int Repeated(int[] values)
    {
        var total = 0;
        foreach (var value in values)
        {
            if (value > 10 && value < 100)
            {
                total += value;
                if (value % 2 == 0) total++;
            }
            else if (value < 0) total -= value;
        }
        return total;
    }
}
