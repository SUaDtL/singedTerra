using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace SingedTerra.LastStand
{
    // Small, bounded JSON data codec for the local save envelope. No reflection,
    // type names, executable values, float coercion, duplicate keys or recovery
    // defaults. Schema owners validate every field after the syntax is read.
    internal static class LastStandSaveJson
    {
        internal const int MaximumLength = 65536;
        internal const long MaximumInteger = 9007199254740991L;
        internal static Dictionary<string, object> Read(string source)
        {
            var parser = new Parser(source);
            object value = parser.Value(0);
            parser.End();
            return Object(value);
        }
        internal static Dictionary<string, object> Object(object value) =>
            value as Dictionary<string, object> ?? throw new FormatException("Expected object.");
        internal static List<object> Array(object value) =>
            value as List<object> ?? throw new FormatException("Expected array.");
        internal static int Integer(object value) => value is int number && number >= 0
            ? number : throw new FormatException("Expected nonnegative integer.");
        internal static long LongInteger(object value)
        {
            if(value is int narrow && narrow>=0)return narrow;
            if(value is long wide && wide>=0 && wide<=MaximumInteger)return wide;
            throw new FormatException("Expected bounded nonnegative integer.");
        }
        internal static string String(object value) => value is string text
            ? text : throw new FormatException("Expected string.");
        internal static bool Boolean(object value) => value is bool flag
            ? flag : throw new FormatException("Expected boolean.");
        internal static void Fields(Dictionary<string, object> value, params string[] names)
        {
            if (value.Count != names.Length) throw new FormatException("Unknown or missing save field.");
            foreach (string name in names)
                if (!value.ContainsKey(name)) throw new FormatException("Missing save field.");
        }
        internal static string Write(object value)
        {
            var text = new StringBuilder();
            Append(text, value, 0);
            if (text.Length > MaximumLength) throw new FormatException("Save exceeds bound.");
            return text.ToString();
        }
        static void Append(StringBuilder text, object value, int depth)
        {
            if (depth > 12) throw new FormatException("Save nesting exceeds bound.");
            if (value == null) { text.Append("null"); return; }
            if (value is int number)
            {
                if (number < 0) throw new FormatException("Negative save integer.");
                text.Append(number.ToString(CultureInfo.InvariantCulture)); return;
            }
            if(value is long wide)
            {
                if(wide<0 || wide>MaximumInteger)throw new FormatException("Save integer exceeds exact browser range.");
                text.Append(wide.ToString(CultureInfo.InvariantCulture));return;
            }
            if (value is bool flag) { text.Append(flag ? "true" : "false"); return; }
            if (value is string str)
            {
                text.Append('"');
                foreach (char c in str)
                {
                    if (c == '"' || c == '\\') text.Append('\\').Append(c);
                    else if (c < 32) text.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else text.Append(c);
                }
                text.Append('"'); return;
            }
            if (value is Dictionary<string, object> map)
            {
                text.Append('{'); bool first = true;
                foreach (var pair in map)
                {
                    if (!first) text.Append(','); first = false;
                    Append(text, pair.Key, depth + 1); text.Append(':'); Append(text, pair.Value, depth + 1);
                }
                text.Append('}'); return;
            }
            if (value is System.Collections.IEnumerable sequence)
            {
                text.Append('['); bool first = true;
                foreach (var item in sequence)
                {
                    if (!first) text.Append(','); first = false; Append(text, item, depth + 1);
                }
                text.Append(']'); return;
            }
            throw new FormatException("Unsupported save value.");
        }
        sealed class Parser
        {
            readonly string source;
            int offset, nodes;
            internal Parser(string source)
            {
                if (source == null || source.Length > MaximumLength) throw new FormatException("Save exceeds bound.");
                this.source = source;
            }
            void Space()
            { while (offset < source.Length && (source[offset] == ' ' || source[offset] == '\t' || source[offset] == '\n' || source[offset] == '\r')) offset++; }
            internal void End() { Space(); if (offset != source.Length) throw new FormatException("Trailing data."); }
            bool Take(char c) { Space(); if (offset < source.Length && source[offset] == c) { offset++; return true; } return false; }
            void Need(char c) { if (!Take(c)) throw new FormatException("Invalid save syntax."); }
            internal object Value(int depth)
            {
                if (depth > 12 || ++nodes > 4096) throw new FormatException("Save structure exceeds bound.");
                Space(); if (offset == source.Length) throw new FormatException("Truncated save.");
                char c = source[offset];
                if (c == '{')
                {
                    offset++; var map = new Dictionary<string, object>(StringComparer.Ordinal);
                    if (Take('}')) return map;
                    do
                    {
                        Space(); string key = Text(); Need(':');
                        if (map.ContainsKey(key)) throw new FormatException("Duplicate save key.");
                        map.Add(key, Value(depth + 1));
                    } while (Take(','));
                    Need('}'); return map;
                }
                if (c == '[')
                {
                    offset++; var list = new List<object>();
                    if (Take(']')) return list;
                    do { list.Add(Value(depth + 1)); } while (Take(','));
                    Need(']'); return list;
                }
                if (c == '"') return Text();
                if (c >= '0' && c <= '9')
                {
                    int start = offset++;
                    if (c != '0') while (offset < source.Length && source[offset] >= '0' && source[offset] <= '9') offset++;
                    if (!long.TryParse(source.Substring(start, offset - start), NumberStyles.None, CultureInfo.InvariantCulture, out long result) || result>MaximumInteger)
                        throw new FormatException("Save integer overflow.");
                    if(result<=int.MaxValue)return (int)result;
                    return result;
                }
                if (Literal("true")) return true;
                if (Literal("false")) return false;
                if (Literal("null")) return null;
                throw new FormatException("Invalid save value.");
            }
            bool Literal(string text)
            {
                if (offset + text.Length > source.Length || string.CompareOrdinal(source, offset, text, 0, text.Length) != 0) return false;
                offset += text.Length; return true;
            }
            string Text()
            {
                if (offset >= source.Length || source[offset++] != '"') throw new FormatException("Expected save string.");
                var text = new StringBuilder();
                while (offset < source.Length)
                {
                    char c = source[offset++];
                    if (c == '"') return text.ToString();
                    if (c < 32) throw new FormatException("Invalid save string.");
                    if (c == '\\')
                    {
                        if (offset == source.Length) throw new FormatException("Truncated string escape.");
                        c = source[offset++];
                        switch (c)
                        {
                            case '"': case '\\': case '/': break;
                            case 'b': c = '\b'; break; case 'f': c = '\f'; break;
                            case 'n': c = '\n'; break; case 'r': c = '\r'; break; case 't': c = '\t'; break;
                            case 'u':
                                if (offset + 4 > source.Length || !ushort.TryParse(source.Substring(offset, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture, out ushort code))
                                    throw new FormatException("Invalid unicode escape.");
                                c = (char)code; offset += 4; break;
                            default: throw new FormatException("Invalid string escape.");
                        }
                    }
                    text.Append(c);
                    if (text.Length > 2048) throw new FormatException("Save string exceeds bound.");
                }
                throw new FormatException("Unterminated save string.");
            }
        }
    }
}
